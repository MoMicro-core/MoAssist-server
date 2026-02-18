'use strict';

module.exports = {
  add: {
    type: 'post',
    access: ['guest', 'admin', 'unregistered'],
    handler: async ({ fastify, client, listingId = null, category }) => {
      const user = await fastify.mongodb.user.findOne({
        uid: client.session.uid,
      });
      const wishlistCategory = user.wishlist.find((w) => w.name === category);
      if (wishlistCategory) {
        wishlistCategory.listings.push(listingId);
      } else {
        user.wishlist.push({
          name: category,
          listings: listingId ? [listingId] : [],
        });
      }
      if (listingId) {
        const listing = await fastify.mongodb.listings.findOne({
          id: listingId,
        });
        listing.likes += 1;
        const today = listing.likesByDay.find(
          (day) => day.date === new Date().toDateString(),
        );
        if (today) {
          today.count += 1;
        } else {
          listing.likesByDay.push({
            date: new Date().toDateString(),
            count: 1,
          });
        }
      }
      await user.save();
      return { message: 'Listing added to wishlist', wishlist: user.wishlist };
    },
    schema: {
      tags: ['Wishlist'],
      summary: 'Add to wishlist',
      description:
        'Adds a listing to a wishlist category. Creates the category if ' +
        'it doesn\'t exist. Increments the listing\'s like count and ' +
        'records daily statistics.',
      body: {
        type: 'object',
        required: ['token', 'category', 'listingId'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          listingId: { type: 'string' },
          category: { type: 'string', description: 'Wishlist category' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            wishlist: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
  },
  createEmpty: {
    type: 'post',
    access: ['guest', 'admin', 'unregistered'],
    handler: async ({ fastify, client, category }) => {
      const user = await fastify.mongodb.user.findOne({
        uid: client.session.uid,
      });
      user.wishlist.push({
        name: category,
        listings: [],
      });
      await user.save();
      return { message: 'Listing added to wishlist', wishlist: user.wishlist };
    },
    schema: {
      tags: ['Wishlist'],
      summary: 'Create wishlist category',
      description:
        'Creates a new empty wishlist category for organizing saved ' +
        'listings. Category names must be unique per user.',
      body: {
        type: 'object',
        required: ['token', 'category'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          category: { type: 'string', description: 'Wishlist category' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            wishlist: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
  },

  editName: {
    type: 'put',
    access: ['guest', 'admin', 'unregistered'],
    handler: async ({ fastify, client, oldName, newName }) => {
      const user = await fastify.mongodb.user.findOne({
        uid: client.session.uid,
      });
      const wishlistCategory = user.wishlist.find((w) => w.name === oldName);
      if (!wishlistCategory) {
        return { message: 'Category not found', statusCode: 404 };
      }
      wishlistCategory.name = newName;
      await user.save();
      return { message: 'Wishlist category edited', wishlist: user.wishlist };
    },
    schema: {
      tags: ['Wishlist'],
      summary: 'Rename wishlist category',
      description:
        'Updates the name of an existing wishlist category. Returns 404 ' +
        'if the original category name is not found.',
      body: {
        type: 'object',
        required: ['token', 'oldName', 'newName'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          oldName: { type: 'string', description: 'Old category name' },
          newName: { type: 'string', description: 'New category name' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            wishlist: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
  },

  get: {
    type: 'post',
    access: ['guest', 'admin', 'unregistered'],
    handler: async ({ fastify, client }) => {
      const user = await fastify.mongodb.user.findOne({
        uid: client.session.uid,
      });
      if (!user) return { message: 'User not found', statusCode: 404 };
      return { wishlist: user.wishlist };
    },
    schema: {
      tags: ['Wishlist'],
      summary: 'Get user wishlists',
      description:
        'Retrieves all wishlist categories and their saved listings ' +
        'for the authenticated user.',
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
            message: { type: 'string' },
            wishlist: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
  },
  removeListing: {
    type: 'delete',
    access: ['guest', 'admin', 'unregistered'],
    handler: async ({ fastify, client, listingId, category }) => {
      const user = await fastify.mongodb.user.findOne({
        uid: client.session.uid,
      });
      const wishlistCategory = user.wishlist.find((w) => w.name === category);
      if (!wishlistCategory) {
        return { message: 'category not found', statusCode: 404 };
      }
      wishlistCategory.listings = wishlistCategory.listings.filter(
        (l) => l !== listingId,
      );
      await user.save();
      return {
        message: 'Listing removed from wishlist',
        wishlist: user.wishlist,
      };
    },
    schema: {
      tags: ['Wishlist'],
      summary: 'Remove listing from wishlist',
      description:
        'Removes a specific listing from a wishlist category. The ' +
        'category remains even if empty after removal.',
      body: {
        type: 'object',
        required: ['token', 'listingId', 'category'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          listingId: { type: 'string', description: 'Listing MongoDB id' },
          category: { type: 'string', description: 'Wishlist category' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            wishlist: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
  },
  removeCategory: {
    type: 'delete',
    access: ['guest', 'admin', 'unregistered'],
    handler: async ({ fastify, client, category }) => {
      const user = await fastify.mongodb.user.findOne({
        uid: client.session.uid,
      });
      user.wishlist = user.wishlist.filter((w) => w.name !== category);
      await user.save();
      return {
        message: 'Category removed from wishlist',
        wishlist: user.wishlist,
      };
    },
    schema: {
      tags: ['Wishlist'],
      summary: 'Delete wishlist category',
      description:
        'Permanently removes a wishlist category and all its saved ' +
        'listings. This action cannot be undone.',
      body: {
        type: 'object',
        required: ['token', 'category'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          category: { type: 'string', description: 'Wishlist category' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            wishlist: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
  },
};
