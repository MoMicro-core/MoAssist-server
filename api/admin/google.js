'use strict';
// const fs = require('node:fs');
//
// module.exports = {
//   authUrl: {
//     type: 'post',
//     access: ['admin'],
//     protocols: ['http'],
//     handler: async ({ fastify }) => {
//       const authUrl = fastify.oAuth2Client.generateAuthUrl({
//         // eslint-disable-next-line camelcase
//         access_type: 'offline',
//         scope: [
//           'https://www.googleapis.com/auth/gmail.send',
//           'https://www.googleapis.com/auth/gmail.readonly',
//         ],
//         prompt: 'consent',
//       });
//       return { authUrl };
//     },
//     schema: {
//       tags: ['Admin'],
//       summary: 'get google auth url',
//       description: 'get google auth url',
//       body: {
//         type: 'object',
//         required: ['token'],
//         properties: {
//           token: { type: 'string', description: 'Session token' },
//         },
//       },
//       response: {
//         200: {
//           type: 'object',
//           properties: {
//             authUrl: { type: 'string' },
//           },
//         },
//       },
//     },
//   },
//
//   checkCode: {
//     type: 'post',
//     access: ['admin'],
//     protocols: ['http'],
//     handler: async ({ fastify, code }) => {
//       const { tokens } = await fastify.oAuth2Client.getToken(code);
//       if (!tokens.refresh_token) {
//         return { message: 'Failed to obtain refresh token',
//         statusCode: 400 };
//       }
//
//       // eslint-disable-next-line max-len
//       const fileContent = `export const OAUTH_REFRESH_TOKEN =
//       '${tokens.refresh_token}';\n`;
//       fs.writeFileSync(fastify.refreshTokenFile, fileContent);
//
//       return { message: 'Refresh token saved successfully' };
//     },
//     schema: {
//       tags: ['Admin'],
//       summary: 'get google auth url',
//       description: 'get google auth url',
//       body: {
//         type: 'object',
//         required: ['token', 'code'],
//         properties: {
//           token: { type: 'string', description: 'Session token' },
//           code: { type: 'string', description: 'code' },
//         },
//       },
//       response: {
//         200: {
//           type: 'object',
//           properties: {
//             message: { type: 'string' },
//           },
//         },
//       },
//     },
//   },
//
//   oauth2callback: {
//     type: 'get',
//     access: ['public'],
//     protocols: ['http'],
//     handler: async ({ fastify, request }) => {
//       const code = request.query.code;
//       if (!code) return { message: 'No code received', statusCode: 400 };
//
//       try {
//         const { tokens } = await fastify.oAuth2Client.getToken(code);
//         if (!tokens.refresh_token) {
//        eslint-disable-next-line max-len
//           return { message: 'Failed to obtain refresh token', statusCode: 400 };
//         }
//
//        eslint-disable-next-line max-len
//         const fileContent = `'use strict'; \n const OAUTH_REFRESH_TOKEN = '${tokens.refresh_token}';\n
//         module.exports = { OAUTH_REFRESH_TOKEN };`;
//         fs.writeFileSync(fastify.refreshTokenFile, fileContent);
//
//         return { message: 'Refresh token saved successfully' };
//       } catch (err) {
//         console.error(err);
//         return { message: err.message, statusCode: 400 };
//       }
//     },
//     schema: {
//       tags: ['Admin'],
//       summary: 'get google auth url',
//       description: 'get google auth url',
//       response: {
//         200: {
//           type: 'object',
//           properties: {
//             message: { type: 'string' },
//           },
//         },
//       },
//     },
//   },
// };
