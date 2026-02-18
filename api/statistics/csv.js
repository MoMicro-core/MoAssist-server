'use strict';

class LanguageProvider {
  static create(lang) {
    const map = {
      english: {
        section: 'Section',
        name: 'Name',
        value: 'Value',
        summary: 'Summary',
        totalNights: 'Total Nights',
        occupancy: 'Occupancy Rate',
        views: 'Listing Views',
        reserved: 'Reserved Nights',
        earnings: 'Earnings',
        totalNet: 'Total Net',
        payouts: 'Payouts',
        totalPayouts: 'Total Payouts',
        transfers: 'Transfers',
        bookingId: 'Booking ID',
        amount: 'Amount',
        checkIn: 'Check-in',
        checkOut: 'Check-out',
        upcomingEarnings: 'Upcoming Earnings',
        refunds: 'Refunds',
      },
      arabic: {
        section: 'القسم',
        name: 'المفتاح',
        value: 'القيمة',
        summary: 'ملخص',
        totalNights: 'إجمالي الليالي',
        occupancy: 'معدل الإشغال',
        views: 'عدد المشاهدات',
        reserved: 'الليالي المحجوزة',
        earnings: 'الأرباح',
        totalNet: 'إجمالي الصافي',
        payouts: 'المدفوعات',
        totalPayouts: 'إجمالي المدفوعات',
        transfers: 'الحجوزات',
        bookingId: 'معرّف الحجز',
        amount: 'المبلغ',
        checkIn: 'تاريخ الوصول',
        checkOut: 'تاريخ المغادرة',
        upcomingEarnings: 'الأرباح القادمة',
        refunds: 'المبالغ المستردة',
      },
      ukrainian: {
        section: 'Розділ',
        name: 'Назва',
        value: 'Значення',
        summary: 'Підсумок',
        totalNights: 'Всього ночей',
        occupancy: 'Рівень заповненості',
        views: 'Перегляди оголошень',
        reserved: 'Зарезервовані ночі',
        earnings: 'Дохід',
        totalNet: 'Чистий дохід',
        payouts: 'Виплати',
        totalPayouts: 'Загальні виплати',
        transfers: 'Бронювання',
        bookingId: 'ID бронювання',
        amount: 'Сума',
        checkIn: 'Дата заїзду',
        checkOut: 'Дата виїзду',
        upcomingEarnings: 'Майбутні виплати',
        refunds: 'Повернення',
      },
    };
    if (!map[lang]) throw new Error('Unsupported language');
    return map[lang];
  }
}

class CSVBuilder {
  constructor(t) {
    this.t = t;
  }

  build(data) {
    const t = this.t;
    const currencyColumns = new Set();

    const multiCurrencyFields = [
      data.earnings.totalNet,
      data.earnings.totalPayouts,
      data.upcomingEarnings,
      data.refundAmounts,
    ];
    multiCurrencyFields.forEach((obj) => {
      if (!obj) return;
      for (const c of Object.keys(obj)) currencyColumns.add(c.toUpperCase());
    });

    const currencyList = Array.from(currencyColumns);

    const header = ['Section', 'Name', 'Value', ...currencyList].join(';');
    const lines = [header];

    const addRow = (section, name, value, currencies = {}) => {
      const row = [
        section,
        name,
        value,
        ...currencyList.map((c) => currencies[c] ?? ''),
      ];
      lines.push(row.join(';'));
    };

    addRow(t.summary, t.totalNights, data.totalNights);
    addRow(t.summary, t.occupancy, data.occupancy);
    addRow(t.summary, t.views, data.views);
    addRow(t.summary, t.reserved, data.reserved);

    const addMultiCurrencyRow = (section, name, obj) => {
      const currencies = {};
      for (const [currency, amount] of Object.entries(obj || {})) {
        currencies[currency.toUpperCase()] = amount;
      }
      addRow(section, name, '', currencies);
    };

    addMultiCurrencyRow(t.earnings, t.totalNet, data.earnings.totalNet);
    addMultiCurrencyRow(t.payouts, t.totalPayouts, data.earnings.totalPayouts);
    addMultiCurrencyRow(
      t.upcomingEarnings,
      t.upcomingEarnings,
      data.upcomingEarnings,
    );
    addMultiCurrencyRow(t.refunds, t.refunds, data.refundAmounts);

    (data.earnings.transfers || []).forEach((tr, i) => {
      console.log(tr);
      addRow(t.transfers, `${t.bookingId} ${i + 1}`, tr.bookingId, {
        [tr.currency]: tr.amount,
      });
    });

    return lines.join('\n');
  }
}

module.exports = {
  export: {
    type: 'post',
    access: ['host'],
    protocols: ['http'],
    handler: async ({ fastify, client, fromDate, toDate, listingId, lang }) => {
      const earnings = await fastify.statistics.getEarnings({
        client,
        fromDate,
        toDate,
        listingId,
      });
      const translations = LanguageProvider.create(
        lang || client.session.language,
      );
      let from = new Date(fromDate);
      let to = new Date(toDate);
      if (!from || !to) {
        const user = await fastify.mongodb.user
          .findOne({ uid: client.session.uid })
          .select('createdAt');
        from = new Date(user.createdAt);
        to = new Date();
      }
      const csv = new CSVBuilder(translations).build(earnings, from, to);
      const headers = {
        'Content-Type': 'text/csv',
        // eslint-disable-next-line max-len
        'Content-Disposition': `attachment; filename="host-metrics-${from.toISOString().split('T')[0]}_${to.toISOString().split('T')[0]}.csv"`,
      };
      return { file: csv, headers };
    },
    schema: {
      tags: ['Statistics'],
      summary: 'Export earnings as CSV',
      description:
        'Generates a downloadable CSV file containing host earnings ' +
        'data. Includes summary statistics, payouts, transfers, and ' +
        'upcoming earnings across multiple currencies. Supports date ' +
        'range filtering and optional listing filter. Localized in ' +
        'English, Arabic, or Ukrainian.',
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'Session token' },
          fromDate: {
            type: 'string',
            format: 'date',
            description: 'From date',
          },
          toDate: { type: 'string', format: 'date', description: 'To date' },
          listingId: { type: 'string', description: 'Listing ID (id)' },
          lang: { type: 'string', description: 'Language' },
        },
      },
      response: {
        200: {
          description: 'PDF receipt',
          type: 'string',
          content: {
            'text/csv': {
              schema: {
                type: 'string',
                format: 'binary',
              },
            },
          },
        },
      },
    },
  },
};
