'use strict';

const fp = require('fastify-plugin');

const getExchangeRate = (apiKey) => async (sourceCurrency, targetCurrency) => {
  try {
    const url = `https://api.transferwise.com/v1/rates?source=${sourceCurrency}&target=${targetCurrency}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Error fetching rates: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    if (data.length > 0) {
      console.log(`${sourceCurrency} → ${targetCurrency} rate:`, data[0].rate);
      console.log('Rate timestamp:', data[0].time);
      return data[0].rate;
    } else {
      console.log(
        `No rates available for ${sourceCurrency} → ${targetCurrency}`,
      );
      return null;
    }
  } catch (err) {
    console.error('Error:', err.message);
    return null;
  }
};

const wisePlugin = async (fastify) => {
  fastify.log.info('Initializing Wise Plugin');

  fastify.decorate(
    'transferwise',
    getExchangeRate(process.env.TRANSFERWISE_API_KEY),
  );
};

module.exports = fp(wisePlugin, {
  fastify: '5.x',
});
