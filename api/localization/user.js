'use strict';

module.exports = {
  editDescLanguage: {
    type: 'post',
    access: ['host'],
    handler: async ({ client, fastify, lang, description }) => {
      const user = await fastify.mongodb.user.findOne({
        uid: client.session.uid,
      });
      user.description.find((l) => l.language === lang).content = description;
      await user.save();
      return { message: 'Language description updated' };
    },
    schema: {
      tags: ['User'],
      summary: 'Update user profile description',
      description:
        'Updates the user profile description for a specific language. ' +
        'Requires host access. Modifies the description content for the ' +
        'specified language in the user profile.',
      body: {
        type: 'object',
        required: ['token', 'lang', 'description'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          lang: { type: 'string', description: 'Language' },
          description: { type: 'string', description: 'Description' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Language updated' },
          },
        },
      },
    },
  },

  translateDesc: {
    type: 'post',
    access: ['host'],
    handler: async ({ client, fastify, description }) => {
      const translationDescription = await fastify.openai.translate({
        data: {
          description,
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
        content: description,
        language: client.session.language,
      });
      await fastify.mongodb.user.updateOne(
        { uid: client.session.uid },
        { $set: { description: descriptions } },
      );
      return { message: 'Language description updated' };
    },
    schema: {
      tags: ['User'],
      summary: 'Auto-translate user description',
      description:
        'Automatically translates the user profile description to all ' +
        'supported languages using AI. Requires host access. The ' +
        'original description is preserved and translations are ' +
        'generated for all other configured languages.',
      body: {
        type: 'object',
        required: ['token', 'description'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          description: { type: 'string', description: 'Description' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Language updated' },
          },
        },
      },
    },
  },
};
