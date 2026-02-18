'use strict';
const { ObjectId } = require('mongodb');

const patterns = {
  phone:
    /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?(?:\d[-.\s]?){9,}\b/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  url: /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/\S*)?\b/gi,
  socialHandle: /@([a-zA-Z0-9_]+)/g,
};

function detectSensitiveInfo(text) {
  const detected = {};

  for (const [type, regex] of Object.entries(patterns)) {
    const matches = text.match(regex);
    if (matches) {
      detected[type] = matches;
    }
  }

  return detected;
}

module.exports = {
  create: {
    type: 'post',
    access: ['all', 'unregistered'],
    handler: async ({
      fastify,
      client,
      listingId,
      message,
      userUid = null,
    }) => {
      const detectedInfo = detectSensitiveInfo(message);
      if (Object.keys(detectedInfo).length > 0) {
        return {
          message: 'Sensitive info detected',
          detectedInfo,
          statusCode: 400,
        };
      }
      const listing = await fastify.mongodb.listings.findOne({
        id: listingId,
      });
      if (!listing) {
        return { message: 'Listing not found', statusCode: 404 };
      }
      const users = [];
      if (listing.ownerUid === client.session.uid) {
        users.push({
          name: client.session.name,
          uid: client.session.uid,
          role: 'host',
        });
        const guestUser = await fastify.mongodb.user.findOne({ uid: userUid });
        if (!guestUser) {
          return { message: 'Guest user not found', statusCode: 404 };
        }
        users.push({
          name: guestUser.name,
          uid: guestUser.uid,
          role: 'guest',
        });
      } else {
        const hostUser = await fastify.mongodb.user.findOne({
          uid: listing.ownerUid,
        });
        users.push({
          name: client.session.name,
          uid: client.session.uid,
          role: 'guest',
        });
        users.push({
          name: hostUser.name,
          uid: listing.ownerUid,
          role: 'host',
        });
      }
      const chat = await fastify.mongodb.chats.create({
        listing: listingId,
        users,
        managers: listing.managers,
        messages: [
          {
            author: client.session.name,
            authorUid: client.session.uid,
            text: message,
            date: Date.now(),
          },
        ],
      });
      return { message: 'Chat created', chat };
    },

    schema: {
      tags: ['Chat'],
      summary: 'Create new conversation',
      description:
        'Initiates a new chat conversation with a listing host. Requires ' +
        'guest or unregistered user access. Validates that the listing ' +
        'exists and user is not the owner. Automatically detects and ' +
        'blocks messages containing sensitive information (phone, email, ' +
        'URLs, social handles). New messages are received via WebSocket ' +
        'after creation.',
      consumes: ['application/json'],
      body: {
        type: 'object',
        required: ['token', 'listingId', 'message'],
        properties: {
          message: { type: 'string', description: ' Your first message' },
          token: { type: 'string', description: 'Session token' },
          listingId: { type: 'string', description: 'Listing ID (id)' },
          userUid: {
            type: 'string',
            description:
              'Guest user UID (required if the creator is the listing owner)',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            chat: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
  },

  getUnread: {
    type: 'post',
    access: ['all', 'unregistered'],
    handler: async ({ fastify, client }) => {
      const unread = await fastify.mongodb.chats.countDocuments({
        $or: [
          { 'users.uid': client.session.uid },
          { managers: { $in: [client.session.uid] } },
        ],
        messages: {
          $elemMatch: {
            read: false,
            authorUid: { $ne: client.session.uid },
          },
        },
      });
      return { unread };
    },

    schema: {
      tags: ['Chat'],
      summary: 'Get unread chat count',
      description:
        'Returns the total count of chats containing unread messages ' +
        'for the authenticated user. Includes chats where user is a ' +
        'participant or a listing manager.',
      consumes: ['application/json'],
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'Session token' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            unread: { type: 'number' },
          },
        },
      },
    },
  },

  getUnreadedMessages: {
    type: 'post',
    access: ['all', 'unregistered'],
    handler: async ({ fastify, client }) => {
      const chats = await fastify.mongodb.chats
        .find({
          $or: [
            { 'users.uid': client.session.uid },
            { managers: { $in: [client.session.uid] } },
          ],
        })
        .sort({ createdAt: -1 })
        .select('messages id')
        .lean();
      if (!chats) return { message: 'Chats not found', statusCode: 404 };
      for (const chat of chats) {
        const unreadedMessages = chat.messages.filter(
          (message) =>
            !message.read && message.authorUid !== client.session.uid,
        );
        chat.unreadedMessages = unreadedMessages.length;
        delete chat.messages;
        delete chat._id;
      }
      return { chats };
    },
    schema: {
      tags: ['Chat'],
      summary: 'Get unread messages per chat',
      description:
        'Returns a list of all user chats with the count of unread ' +
        'messages in each. Useful for displaying notification badges. ' +
        'Includes chats where user is a participant or listing manager.',
      consumes: ['application/json'],
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'Session token' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            chats: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
  },

  getChats: {
    type: 'post',
    access: ['all', 'unregistered'],
    handler: async ({
      fastify,
      client,
      page,
      pageSize,
      countOfMessages = 5,
    }) => {
      const chats = await fastify.mongodb.chats
        .find({
          $or: [
            { 'users.uid': client.session.uid },
            { managers: { $in: [client.session.uid] } },
          ],
        })
        .sort({ createdAt: -1 })
        .select('users title id messages listing')
        .slice('messages', -countOfMessages)
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean();
      if (!chats) return { message: 'Chats not found', statusCode: 404 };
      const localizedChats = await fastify.localization.chats(
        chats,
        client.session.language,
      );
      return { chats: localizedChats };
    },

    schema: {
      tags: ['Chat'],
      summary: 'List user conversations',
      description:
        'Retrieves paginated list of chat conversations for the ' +
        'authenticated user. Returns chats where user is a participant ' +
        'or listing manager. Includes localized listing information and ' +
        'configurable number of recent messages per chat.',
      consumes: ['application/json'],
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          page: {
            type: 'number',
            description: 'Page number',
            minimum: 1,
          },
          pageSize: {
            type: 'number',
            description: 'Number of items per page',
            minimum: 1,
          },
          countOfMessages: {
            type: 'number',
            description: 'Count of messages',
            minimum: 1,
            maximum: 10,
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            chats: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
              message: { type: 'string' },
            },
          },
        },
      },
    },
  },

  getChat: {
    type: 'post',
    access: ['all', 'unregistered'],
    handler: async ({ fastify, client, chatId }) => {
      const chat = await fastify.mongodb.chats
        .findOne({
          id: chatId,
          $or: [
            { 'users.uid': client.session.uid },
            { managers: { $in: [client.session.uid] } },
          ],
        })
        .lean();
      if (!chat) return { message: 'Chat not found', statusCode: 404 };
      const localizedChat = await fastify.localization.chats(
        [chat],
        client.session.language,
      );
      return { chat: localizedChat[0] };
    },
    schema: {
      tags: ['Chat'],
      summary: 'Get conversation details',
      description:
        'Retrieves complete details of a specific chat conversation ' +
        'including all messages. User must be a participant or listing ' +
        'manager. Returns localized listing information.',
      consumes: ['application/json'],
      body: {
        type: 'object',
        required: ['token', 'chatId'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          chatId: { type: 'string', description: 'Chat ID (id)' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            chat: { type: 'object', additionalProperties: true },
            message: { type: 'string' },
          },
        },
      },
    },
  },

  // stream: {
  //   ptotocols: ['ws'],
  //   access: ['user'],
  //   handler: async ({ fastify, client, chatId }, socket) => {
  //     if (!chatId) return { message: 'Chat id is required' };
  //     const chat = await fastify.mongodb.chats.findOne({ id: chatId });
  //     if (!chat) return { message: 'Chat not found' };
  //     if (!chat.users.includes(client.session.uid)) {
  //       return { message: 'not your chat' };
  //     }
  //     const stream = fastify.mongodb.chats.watch([], {
  //       fullDocument: 'updateLookup',
  //       updateLookup: { fullDocument: true },
  //     });
  //     client.addStream(stream);
  //     stream.on('change', (change) => {
  //       console.log(change);
  //       if (change.operationType !== 'update') return;
  //       if (!change.fullDocument.users.includes(client.session.uid)) {
  //         return;
  //       }
  //       for (const [key, value] of Object.entries(
  //         change.updateDescription.updatedFields,
  //       )) {
  //         if (!key.startsWith('messages')) continue;
  //         if (value.authorUid === client.session.uid) continue;
  //         const chatId = change.fullDocument.id;
  //         const payload = JSON.stringify({
  //           chatId,
  //           newMessage: value,
  //         });
  //         socket.send(payload);
  //       }
  //     });
  //     return { message: 'Connected' };
  //   },
  // },

  send: {
    type: 'post',
    access: ['all', 'unregistered'],
    handler: async ({ fastify, client, text, chatId }) => {
      if (!text) return { message: 'Text is required' };
      const detectedInfo = detectSensitiveInfo(text);
      if (Object.keys(detectedInfo).length > 0) {
        return {
          message: 'Sensitive info detected',
          detectedInfo,
          statusCode: 400,
        };
      }
      if (!chatId) return { message: 'Chat ID is required' };
      const chat = await fastify.mongodb.chats.findOne(
        {
          id: chatId,
          $or: [
            { 'users.uid': client.session.uid },
            { managers: { $in: [client.session.uid] } },
          ],
        },
        { messages: { $slice: -1 } },
      );
      if (!chat) return { message: 'Chat not found', statusCode: 404 };
      await fastify.mongodb.chats.findOneAndUpdate(
        { id: chatId },
        {
          $push: {
            messages: {
              read: false,
              author: client.session.name,
              authorUid: client.session.uid,
              text,
              date: Date.now(),
            },
          },
        },
      );
      return { message: 'Message is sent' };
    },
    schema: {
      tags: ['Chat'],
      summary: 'Send chat message',
      description:
        'Sends a text message to an existing chat conversation. User ' +
        'must be a participant or listing manager. Automatically detects ' +
        'and blocks messages containing sensitive information (phone, ' +
        'email, URLs, social handles).',
      consumes: ['application/json'],
      body: {
        type: 'object',
        required: ['token', 'chatId', 'text'],
        properties: {
          text: { type: 'string', description: 'Your message' },
          token: { type: 'string', description: 'Session token' },
          chatId: { type: 'string', description: 'Chat ID (id)' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      },
    },
  },

  setRead: {
    type: 'post',
    access: ['all', 'unregistered'],
    handler: async ({ fastify, client, chatId, messagesIds }) => {
      const chat = await fastify.mongodb.chats.findOne({ id: chatId });
      if (!chat) return { message: 'Chat not found', statusCode: 404 };
      if (!chat.users.some((user) => user.uid === client.session.uid)) {
        const listing = await fastify.mongodb.listings.findOne({
          id: chat.listing,
        });
        if (!listing.managers.includes(client.session.uid)) {
          return { message: 'Not your chat', statusCode: 403 };
        }
        return { message: 'Not your chat', statusCode: 403 };
      }
      const objectIds = messagesIds.map((id) => new ObjectId(id));
      await fastify.mongodb.chats.findOneAndUpdate(
        { id: chatId },
        {
          $set: {
            'messages.$[msg].read': true,
          },
        },
        {
          arrayFilters: [{ 'msg._id': { $in: objectIds } }],
        },
      );
      return { message: 'Messages are read' };
    },
    schema: {
      tags: ['Chat'],
      summary: 'Mark messages as read',
      description:
        'Marks specified messages as read in a chat conversation. User ' +
        'must be a participant or listing manager. Accepts an array of ' +
        'message IDs to mark as read.',
      consumes: ['application/json'],
      body: {
        type: 'object',
        required: ['token', 'chatId', 'messagesIds'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          chatId: { type: 'string', description: 'Chat ID (id)' },
          messagesIds: {
            type: 'array',
            description: 'Messages ids',
            items: { type: 'string' },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      },
    },
  },

  sendAttachment: {
    type: 'post',
    access: ['all', 'unregistered'],
    ptotocols: ['http'],
    handler: async ({ fastify, client, chatId, files, text }) => {
      if (!files || (Array.isArray(files) && files.length === 0)) {
        return { message: 'No images provided', statusCode: 400 };
      }
      if (text) {
        const detectedInfo = detectSensitiveInfo(text);
        if (Object.keys(detectedInfo).length > 0) {
          return {
            message: 'Sensitive info detected',
            detectedInfo,
            statusCode: 400,
          };
        }
      }
      if (!chatId) return { message: 'Chat ID is required', statusCode: 400 };
      const chat = await fastify.mongodb.chats.findOne({ id: chatId });
      if (!chat) return { message: 'Chat not found', statusCode: 404 };
      if (!chat.users.some((user) => user.uid === client.session.uid)) {
        const listing = await fastify.mongodb.listings.findOne({
          id: chat.listing,
        });
        if (!listing.managers.includes(client.session.uid)) {
          return { message: 'Not your chat', statusCode: 403 };
        }
      }
      const urls = [];
      const fileArray = Array.isArray(files) ? files : [files];
      for (const file of fileArray) {
        const { _buf: fileBuffer, filename } = file;
        const url = await fastify.doSpaces.uploadToSpaces({
          fileStream: fileBuffer,
          filename,
          folder: 'chats',
          mimetype: file.mimetype,
          contentLength: fileBuffer.length,
        });
        urls.push(url);
      }
      await fastify.mongodb.chats.findOneAndUpdate(
        { id: chatId },
        {
          $push: {
            messages: {
              read: false,
              author: client.session.name,
              authorUid: client.session.uid,
              attachments: urls,
              text: text || '',
              date: Date.now(),
            },
          },
        },
      );
      return { message: 'Message is sent' };
    },
    schema: {
      tags: ['Chat'],
      summary: 'Send message with files',
      description:
        'Sends a message with file attachments to an existing chat. ' +
        'Accepts multipart/form-data with files and optional text. User ' +
        'must be a participant or listing manager. Supports multiple ' +
        'attachments. Text content is scanned for sensitive information.' +
        '\n\nFields (multipart/form-data):' +
        '\n- required: token, chatId, files (attachment file(s))' +
        '\n- optional: text',
      consumes: ['multipart/form-data'],
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      },
    },
  },
};
