/* eslint-disable max-len */
'use strict';

module.exports = {
  forgotPassword: {
    access: ['public'],
    type: 'post',
    handler: async ({ fastify, email }) => {
      const actionCodeSettings = {
        url: 'https://rstays.com/reset-finish',
        handleCodeInApp: true,
        iOS: {
          bundleId: 'com.rstays.app',
        },
        android: {
          packageName: 'com.rstays.app',
          installApp: true,
          minimumVersion: '1',
        },
        dynamicLinkDomain: 'rstays.com',
      };

      const firebaseLink = await fastify.firebase
        .auth()
        .generatePasswordResetLink(email, actionCodeSettings);
      if (!firebaseLink) return { message: 'Email not found', statusCode: 404 };
      const oobCode = firebaseLink.match(/[oO][oO][bB]Code(?:=|%3D)([^&%]+)/);
      const resetLink = `https://rstays.com/reset-finish?oobCode=${oobCode[1]}`;
      const emailContent = `
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: auto; background-color: #ffffff; padding: 20px; border-radius: 6px;">
      <tr>
        <td>
<h2 style="color: #007BFF;">Reset your password:</h2>

<p>Use the following link to verify your account: </p>
<br>

<h1 style="color: #007BFF; text-align: center; background-color: #f0f0f0; padding: 10px; border-radius: 5px;">
  <a href="${resetLink}" style="text-decoration: none; color: #007BFF;">Reset Password</a>
</h1>

<p>Best regards,<br>The Rstays Team</p>

        </td>
      </tr>
    </table>
      `;
      await fastify.email.sendMail({
        to: email,
        subject: 'Reset Password',
        text: emailContent,
      });
      return { message: 'Email has been sent' };
    },
    schema: {
      summary: 'Request password reset',
      description: 'Sends a password reset email to the specified address using Firebase authentication. The email contains a secure link valid for resetting the password. No authentication required.',
      tags: ['Verification'],
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', description: 'User email' },
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
};
