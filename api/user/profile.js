/* eslint-disable max-len */
'use strict';

module.exports = {
  // get: {
  //   type: 'post',
  //   access: ['all', 'admin'],
  //   handler: async ({ fastify, id }) => {
  //     const user = await fastify.mongodb.user.findOne({ uid: id });
  //     if (!user) return { message: 'User not found', statusCode: 404 };
  //     return { user };
  //   },
  //   schema: {
  //     tags: ['User'],
  //     summary: 'Get a user by their UID',
  //     description: 'Get a user by their UID',
  //     body: {
  //       type: 'object',
  //       required: ['token', 'id'],
  //       properties: {
  //         token: { type: 'string', description: 'Session token' },
  //         id: { type: 'string', description: 'User UID to fetch' },
  //       },
  //     },
  //     response: {
  //       200: {
  //         type: 'object',
  //         properties: {
  //           user: { type: 'object', additionalProperties: true },
  //           message: { type: 'string' }, // e.g. "User not found"
  //         },
  //       },
  //     },
  //   },
  // },

  getMe: {
    type: 'post',
    access: ['all', 'admin', 'unregistered'],
    handler: async ({ fastify, client }) => {
      console.log(client.session);
      const user = await fastify.mongodb.user.findOne({
        uid: client.session.uid,
      });
      return { user };
    },
    schema: {
      tags: ['User'],
      summary: 'Get current user profile',
      description:
        'Retrieves the complete profile of the currently authenticated user. Available to all authenticated users including admins and unregistered accounts.',
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
            user: { type: 'object', additionalProperties: true },
            message: { type: 'string' },
          },
        },
      },
    },
  },

  update: {
    type: 'post',
    access: ['all', 'admin', 'unregistered'],
    handler: async ({ fastify, client, fields }) => {
      const user = await fastify.mongodb.user.findOne({
        uid: client.session.uid,
      });
      if (!user) return { message: 'User not found', statusCode: 404 };
      for (const [key, value] of Object.entries(fields)) {
        if (key === 'uid' || key === 'responseRate') continue;
        if (key === 'name') {
          await fastify.mongodb.sessions.updateMany(
            { uid: client.session.uid },
            { $set: { 'data.name': value } },
          );
        }
        if (key === 'language') {
          if (!fastify.config.environment.languages.includes(value)) continue;
          await fastify.mongodb.sessions.updateMany(
            { uid: client.session.uid },
            { $set: { 'data.language': value } },
          );
        }
        if (key === 'currency') {
          if (!fastify.config.environment.currencies.includes(value)) continue;
          await fastify.mongodb.sessions.updateMany(
            { uid: client.session.uid },
            { $set: { 'data.currency': value } },
          );
        }
        if (key === 'email' && !user.stripeAccountId) {
          const { customer, account } =
            await fastify.stripeManager.createCustomer({
              country: user.country,
              uid: user.uid,
              email: value,
            });
          user.stripeAccountId = account.id;
          user.stripeId = customer.id;
          const { customer: cusLive, account: accLive } =
            await fastify.stripeManagerLive.createCustomer({
              country: user.country,
              uid: user.uid,
              email: value,
            });
          user.stripeLive.stripeAccountId = accLive.id;
          user.stripeLive.stripeId = cusLive.id;

          // user.email = value;
          await fastify.mongodb.sessions.updateMany(
            { uid: client.session.uid },
            {
              $set: {
                'data.email': value,
                'data.stripeAccountId': account.id,
                'data.stripeId': customer.id,
                'data.stripeLive.stripeAccountId': accLive.id,
                'data.stripeLive.stripeId': cusLive.id,
                mode: 'guest',
              },
            },
          );
        }
        if (key === 'payoutInfo') {
          if (
            value.cards.filter((c) => c.preferred).length > 1 ||
            value.ibans.filter((c) => c.preferred).length > 1
          ) {
            return {
              message: 'Only one card or iban can be preferred',
              statusCode: 400,
            };
          }
          if (value['type'] === 'stripe') {
            const checkOnBoardingLive =
              await fastify.stripeManagerLive.checkOnboardingStatus(
                user.stripeLive.stripeAccountId,
              );
            const checkOnBoarding =
              await fastify.stripeManager.checkOnboardingStatus(
                user.stripeAccountId,
              );
            if (!checkOnBoarding || !checkOnBoardingLive) {
              const link = await fastify.stripeManager.getOnboardingLink(
                user.stripeAccountId,
              );
              const linkLive =
                await fastify.stripeManagerLive.getOnboardingLink(
                  user.stripeLive.stripeAccountId,
                );

              const emailContent = `
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: auto; background-color: #ffffff; padding: 20px; border-radius: 6px;">
      <tr>
        <td>
          <h2 style="color: #007BFF;">You can not use stripe yet</h2>
          <p>Hello,</p>
          <p>You have to finish your onboarding</p>

           ${
             !checkOnBoarding
               ? `
          <a href="${link}"
             style="display: inline-block; padding: 12px 20px; margin: 20px 0; background-color: #007BFF; color: #ffffff; text-decoration: none; border-radius: 4px; font-weight: bold;">
            Make it now! in Sandbox
          </a>
        `
               : ''
           }

        ${
          !checkOnBoardingLive
            ? `  <a href="${linkLive}"
             style="display: inline-block; padding: 12px 20px; margin: 20px 0; background-color: #007BFF; color: #ffffff; text-decoration: none; border-radius: 4px; font-weight: bold;">
            Make it now! in Live
          </a>`
            : ''
        }

        </td>
      </tr>
    </table>
      `;
              await fastify.email.sendMail({
                to: user.email,
                subject: 'Finish stripe onboarding',
                text: emailContent,
              });
            }
          }
        }
        if (key === 'description') {
          const translationDescription = await fastify.openai.translate({
            data: {
              description: value,
            },
            languages: fastify.config.environment.languages.filter(
              (l) => l !== client.session.language,
            ),
          });
          const descriptions = [];
          for (const language of translationDescription.languages) {
            descriptions.push({
              content: language.translation.description,
              language: language.name,
            });
          }
          descriptions.push({
            content: value,
            language: client.session.language,
          });
          user.description = descriptions;
          continue;
        }
        user[key] = value;
      }
      await user.save();
      return { message: 'User updated' };
    },
    schema: {
      tags: ['User'],
      summary: 'Update user profile',
      description:
        'Updates profile fields for the authenticated user. Supports partial updates for name, email, language, currency, and payout information. ' +
        'Email changes trigger Stripe account creation if not already set up.',
      body: {
        type: 'object',
        required: ['token', 'fields'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          fields: {
            type: 'object',
            additionalProperties: true,
            properties: {
              payoutInfo: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['stripe', 'card', 'iban'] },
                  cards: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        cardNumber: { type: 'string' },
                        email: { type: 'string' },
                        name: { type: 'string' },
                        preferred: { type: 'boolean' },
                      },
                    },
                  },
                  ibans: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        number: { type: 'string' },
                        email: { type: 'string' },
                        name: { type: 'string' },
                        preferred: { type: 'boolean' },
                        address: { type: 'string' },
                        bic: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'User updated',
            },
          },
        },
      },
    },
  },

  delete: {
    type: 'delete',
    access: ['all', 'admin', 'unregistered'],
    handler: async ({ fastify, client }) => {
      const user = await fastify.mongodb.user.findOneAndDelete({
        uid: client.session.uid,
      });
      await fastify.mongodb.listings.updateMany(
        { ownerUid: client.session.uid },
        { $set: { status: 'archived' } },
      );
      if (!user) return { message: 'User not found', statusCode: 404 };
      return { message: 'User deleted' };
    },
    schema: {
      tags: ['User'],
      summary: 'Delete user account',
      description:
        'Permanently deletes the authenticated users account and archives' +
        'all associated listings. This action cannot be undone.',
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
            message: {
              type: 'string',
              example: 'User deleted',
            },
          },
        },
      },
    },
  },

  toggleMode: {
    type: 'post',
    access: ['all'],
    handler: async ({ client, fastify }) => {
      client.session.mode = client.session.mode === 'guest' ? 'host' : 'guest';
      await fastify.mongodb.sessions.findOneAndUpdate(
        { token: client.session.token },
        { $set: { mode: client.session.mode } },
      );
      const session = await fastify.mongodb.sessions.findOne({
        uid: client.session.uid,
      });
      console.log(session);
      return { mode: client.session.mode };
    },
    schema: {
      tags: ['User'],
      summary: 'Toggle guest/host mode',
      description:
        'Switches the users session between guest and host modes. Affects available features and API access permissions.',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'Session token' },
        },
      },
      consumes: ['application/json'],
      response: {
        200: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              example: 'guest',
            },
            message: { type: 'string' },
          },
        },
      },
    },
  },

  getMode: {
    type: 'post',
    access: ['all'],
    handler: async ({ client }) => ({ mode: client.session.mode }),
    schema: {
      tags: ['User'],
      summary: 'Get current mode',
      description:
        'Returns the users current session mode (guest or host). Used to determine available UI features and permissions.',
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
            mode: {
              type: 'string',
              example: 'guest',
            },
            message: { type: 'string' },
          },
        },
      },
    },
  },

  uploadImage: {
    type: 'post',
    protocols: ['http'],
    access: ['all'],
    handler: async (props) => {
      const { fastify, client, files } = props;
      const user = await fastify.mongodb.user.findOne({
        uid: client.session.uid,
      });
      if (user.image) {
        const { pathname } = new URL(user.image);
        const key = decodeURIComponent(pathname.slice(1));
        await fastify.doSpaces.deleteFromSpaces(key);
      }

      if (Array.isArray(files)) {
        return { message: 'Only one file is allowed', statusCode: 400 };
      }
      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
      ];
      if (!allowedTypes.includes(files.mimetype)) {
        return { message: 'Invalid file type', statusCode: 400 };
      }

      const { _buf: fileBuffer, filename, mimetype } = files;
      const MAX_FILE_SIZE = 20 * 1024 * 1024;
      if (fileBuffer.length > MAX_FILE_SIZE) {
        return { message: 'File size exceeds 20MB limit', statusCode: 400 };
      }
      const url = await fastify.doSpaces.uploadToSpaces({
        fileStream: fileBuffer,
        filename,
        folder: 'images',
        mimetype,
        contentLength: fileBuffer.length,
      });
      user.image = url;
      await user.save();
      return { message: 'Image uploaded successfully', user };
    },
    schema: {
      tags: ['User'],
      summary: 'Upload profile image',
      description:
        'Uploads a new profile avatar image. Accepts JPEG, PNG, WebP, or GIF formats with a maximum size of 20MB. ' +
        'Automatically deletes the previous image if one exists. HTTP protocol only.' +
        '\n\nFields (multipart/form-data):' +
        '\n- required: token, files (single image file)',
      consumes: ['multipart/form-data'],
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            user: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
  },

  toggleStream: {
    type: 'post',
    access: ['all'],
    protocols: ['ws'],
    handler: async ({ client, fastify }) => {
      fastify.client.toggleStream(client);
      return { streamStatus: client.session.stream };
    },
  },
};
