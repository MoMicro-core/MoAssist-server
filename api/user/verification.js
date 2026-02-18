/* eslint-disable max-len */
'use strict';
const crypto = require('node:crypto');

function generateCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

module.exports = {
  generateCode: {
    access: ['all'],
    type: 'post',
    handler: async ({ fastify, client }) => {
      if (client.session.verified) {
        return { message: 'User already verified', statusCode: 500 };
      }
      const code = generateCode();
      await fastify.mongodb.verifications.create({
        userId: client.session.uid,
        code,
      });
      return { code };
    },
    schema: {
      summary: 'Generate verification code',
      description: 'Creates a new 6-digit verification code for account verification. Returns the code for testing purposes. Production use should rely on sendEmail endpoint instead.',
      tags: ['Verification'],
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
            code: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  },

  verifyCode: {
    access: ['all'],
    type: 'post',
    handler: async ({ fastify, client, code }) => {
      if (client.session.verified) {
        return { message: 'User already verified', statusCode: 500 };
      }
      const verification = await fastify.mongodb.verifications.findOne({
        userId: client.session.uid,
        code,
      });
      if (!verification) {
        return { message: 'Code not found', statusCode: 404 };
      }
      await fastify.mongodb.user.updateMany(
        { uid: client.session.uid },
        { $set: { verified: true } },
      );
      await fastify.mongodb.sessions.updateMany(
        { uid: client.session.uid },
        { $set: { 'data.verified': true } },
      );
      await fastify.mongodb.verifications.deleteOne({
        userId: client.session.uid,
      });
      return { message: 'User has been verified' };
    },

    schema: {
      summary: 'Verify account with code',
      description: 'Validates a verification code and marks the user account as verified. Updates all active sessions with verified status. Each code can only be used once.',
      tags: ['Verification'],
      body: {
        type: 'object',
        required: ['token', 'code'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          code: { type: 'string', description: 'Verification code' },
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

  sendEmail: {
    access: ['all'],
    type: 'post',
    handler: async ({ fastify, client }) => {
      if (client.session.verified) {
        return { message: 'User already verified', statusCode: 500 };
      }
      const { email } = await fastify.mongodb.user.findOne(
        { uid: client.session.uid },
        { email: 1 },
      );

      const code = generateCode();
      await fastify.mongodb.verifications.create({
        userId: client.session.uid,
        code,
      });

      const emailContent = `
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: auto; background-color: #ffffff; padding: 20px; border-radius: 6px;">
      <tr>
        <td>
<h2 style="color: #007BFF;">Verification Code</h2>

<p>Use the following code to verify your account: </p>
<br>

<h1 style="color: #007BFF; text-align: center; background-color: #f0f0f0; padding: 10px; border-radius: 5px;">
  ${code}
</h1>

<p>Best regards,<br>The Rstays Team</p>

        </td>
      </tr>
    </table>
      `;
      await fastify.email.sendMail({
        to: email,
        subject: 'Verification Code',
        text: emailContent,
      });
      return { message: 'Email has been sent' };
    },
    schema: {
      summary: 'Send verification email',
      description: 'Generates a verification code and sends it to the user\'s registered email address. The code is valid for account verification via the verifyCode endpoint.',
      tags: ['Verification'],
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
          },
        },
      },
    },
  },

  'accept/:id': {
    type: 'get',
    access: ['public'],
    protocols: ['http'],
    handler: async ({ fastify, request }) => {
      const { id: code } = request.params;
      const verification = await fastify.mongodb.verifications.findOne({
        code,
      });
      if (!verification) {
        return { message: 'Code not found', statusCode: 404 };
      }
      await fastify.mongodb.user.updateMany(
        { uid: verification.userId },
        { $set: { verified: true } },
      );
      await fastify.mongodb.sessions.updateMany(
        { uid: verification.userId },
        { $set: { verified: true } },
      );
      await fastify.mongodb.verifications.deleteOne({
        userId: verification.userId,
      });
      return { message: 'User has been verified' };
    },
    schema: {
      tags: ['Verification'],
      summary: 'Verify via email link',
      description: 'Processes account verification from an email link click. Publicly accessible endpoint that validates the code in the URL and marks the user as verified.',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
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
};
