/* eslint-disable max-len */
'use strict';

module.exports = {
  sendInvite: {
    type: 'post',
    access: ['host'],
    handler: async ({ fastify, client, email, listingId }) => {
      const invitedUser = await fastify.mongodb.user.findOne({ email });
      // if (!invitedUser) return { message: 'Invited user not found' };
      const invitation = await fastify.mongodb.invitations.findOne({
        invitedEmail: email,
        listing: listingId,
        status: 'invited',
      });
      if (invitation) {
        return { message: 'Invitation already sent', statusCode: 500 };
      }
      if (
        invitedUser &&
        invitedUser.permissions.some(
          (permission) => permission.listingId === listingId,
        )
      ) {
        return { message: 'User is already manager', statusCode: 500 };
      }
      const listing = await fastify.mongodb.listings.findOne({
        id: listingId,
        ownerUid: client.session.uid,
      });
      if (!listing) return { message: 'Listing not found', statusCode: 404 };
      const invition = await fastify.mongodb.invitations.create({
        listing: listingId,
        invitedEmail: email,
      });
      const emailContent = `
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: auto; background-color: #ffffff; padding: 20px; border-radius: 6px;">
      <tr>
        <td>
          <h2 style="color: #007BFF;">You're Invited to Be a Co-Host</h2>
          <p>Hello,</p>
          <p>You’ve been invited to co-host a listing. To accept the invitation, click the button below:</p>

          <a href="https://app.rstays.com/api/user/permission/acceptInvite/${invition.id}"
             style="display: inline-block; padding: 12px 20px; margin: 20px 0; background-color: #007BFF; color: #ffffff; text-decoration: none; border-radius: 4px; font-weight: bold;">
            Accept Invitation
          </a>

          <p>If you didn’t expect this invitation, feel free to ignore this email.</p>
        </td>
      </tr>
    </table>
      `;
      await fastify.email.sendMail({
        to: email,
        subject: 'You are Invited to Be a Co-Host',
        text: emailContent,
      });
      return { message: 'Invition sent' };
    },
    schema: {
      tags: ['Invition'],
      summary: 'Send co-host invitation',
      description:
        'Sends an email invitation to add a co-host to a listing. If the user doesn\'t have an account yet, the invitation will be processed upon registration. Requires host access.',
      consumes: ['application/json'],
      body: {
        type: 'object',
        required: ['email', 'listingId', 'token'],
        properties: {
          email: { type: 'string', description: 'Invited user email' },
          listingId: { type: 'string', description: 'Listing MongoDB id' },
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

  'acceptInvite/:id': {
    type: 'get',
    access: ['public'],
    protocols: ['http'],
    handler: async ({ fastify, request }) => {
      const { id: invitionId } = request.params;
      const invition = await fastify.mongodb.invitations.findOne({
        id: invitionId,
      });
      if (!invition) return { message: 'Invition not found' };
      const user = await fastify.mongodb.user.findOne({
        email: invition.invitedEmail,
      });
      if (!user) return { message: 'You have to create a new user first' };
      if (user.permissions.some((p) => p.listingId === invition.listing)) {
        return { message: 'You are already a co-host for this listing' };
      }
      user.permissions.push({
        role: 'co-host',
        listingId: invition.listing,
      });
      await user.save();
      await fastify.mongodb.listings.findOneAndUpdate(
        { id: invition.listing },
        { $push: { managers: user.uid } },
      );
      await fastify.mongodb.invitations.updateOne(
        { id: invitionId },
        { status: 'active' },
      );
      return { message: 'Invition accepted' };
    },
    schema: {
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

  getInvitions: {
    type: 'post',
    access: ['host'],
    handler: async ({ fastify, client, listingId }) => {
      const listing = await fastify.mongodb.listings.findOne({
        id: listingId,
        ownerUid: client.session.uid,
      });
      if (!listing) return { message: 'Listing not found' };
      const invitions = await fastify.mongodb.invitations.find({
        listing: listingId,
      });
      if (!invitions) return { message: 'Invitions not found' };
      return { invitions };
    },
    schema: {
      tags: ['Invition'],
      summary: 'Get listing invitations',
      description:
        'Retrieves all pending and accepted co-host invitations for a specific listing. Only accessible by the listing owner.',
      body: {
        type: 'object',
        required: ['token', 'listingId'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          listingId: { type: 'string', description: 'Listing MongoDB id' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            invitions: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
  },

  deleteManager: {
    type: 'delete',
    access: ['host'],
    handler: async ({ fastify, client, listingId, managers }) => {
      const listing = await fastify.mongodb.listings.findOne({
        id: listingId,
        ownerUid: client.session.uid,
      });
      if (!listing) return { message: 'Listing not found' };
      for (const manager of managers) {
        if (!listing.managers.includes(manager)) continue;
        listing.managers = listing.managers.filter((id) => id !== manager);
        const user = await fastify.mongodb.user.findOne({ uid: manager });
        await fastify.mongodb.invitations.deleteOne({
          listing: listingId,
          invitedEmail: user.email,
        });
        user.permissions = user.permissions.filter(
          (permission) => permission.listingId !== listingId,
        );
        await user.save();
      }
      await listing.save();
      return { message: 'Manager deleted' };
    },
    schema: {
      tags: ['Invition'],
      summary: 'Remove co-host managers',
      description:
        'Removes one or more co-host managers from a listing. Revokes their access permissions and deletes associated invitations. Requires host access.',
      body: {
        type: 'object',
        required: ['token', 'listingId', 'managers'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          listingId: { type: 'string', description: 'Listing MongoDB id' },
          managers: { type: 'array', items: { type: 'string' } },
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
