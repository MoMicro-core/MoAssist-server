'use strict';

const puppeteer = require('puppeteer');

async function generatePdfFromHtml(htmlString) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  await page.setContent(htmlString, { waitUntil: 'networkidle0' });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
  });

  await browser.close();
  return pdfBuffer;
}

module.exports = {
  get: {
    type: 'post',
    access: ['guest', 'unregistered', 'admin'],
    handler: async ({ fastify, bookingId, client }) => {
      const normalBooking = await fastify.mongodb.bookings.findOne({
        id: bookingId,
      });
      if (
        normalBooking.user !== client.session.uid &&
        client.session.mode !== 'admin'
      ) {
        return {
          message: 'You are not the owner of this booking',
          statusCode: 403,
        };
      }
      if (!normalBooking) {
        return { message: 'Booking not found', statusCode: 404 };
      }
      const booking = await fastify.localization
        .translateBookingPrices([normalBooking], client.session.language)
        .then((res) => res[0]);

      // const doc = new PDFDocument();
      // const stream = new PassThrough();
      //
      // doc.pipe(stream);
      //
      // doc
      //   .fontSize(20)
      //   .fillColor('#d43ef5')
      //   .text('RStays', { align: 'left' })
      //   .moveDown(1);
      //
      const formateDate = (isoDate) => {
        const date = new Date(isoDate);
        const options = { weekday: 'short', day: 'numeric', month: 'long' };
        const formattedDate = date.toLocaleDateString('en-GB', options);
        return formattedDate;
      };
      const totalGuests =
        booking.guests.adults +
        booking.guests.children +
        booking.guests.infants;

      function countNights(checkIn, checkOut) {
        const checkInDate = new Date(checkIn);
        const checkOutDate = new Date(checkOut);

        if (isNaN(checkInDate) || isNaN(checkOutDate)) {
          throw new Error('Invalid date format');
        }

        const diffTime = checkOutDate - checkInDate;

        const nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return nights + 1;
      }

      const nights = countNights(booking.checkIn, booking.checkOut);

      function addRow(desc, date, debit, credit) {
        return `
      <tr>
        <td>${desc}</td>
        <td>${date}</td>
        <td>${debit}</td>
        <td>${credit}</td>
      </tr> `;
      }

      const generateRows = async () => {
        const today = new Date();
        let rows = '';

        const listing = await fastify.mongodb.translationListing
          .findOne({ id: booking.listing })
          .lean();

        const lang = client?.session?.language;
        const listingTitle =
          listing.languages.find((l) => l.name === lang)?.translation?.title ||
          '';
        if (booking.type === 'unit') {
          rows += addRow(
            listingTitle,
            formateDate(today),
            (booking.units[0].totalPrice || '00') + ' ' + booking.currency,
            '-',
          );
          for (const service of booking.services) {
            rows += addRow(
              service.name,
              formateDate(today),
              (service.price || '00') + ' ' + booking.currency,
              '-',
            );
          }
          for (const tax of booking.taxes) {
            rows += addRow(
              tax.name,
              formateDate(today),
              (tax.price || '00') + ' ' + booking.currency,
              '-',
            );
          }
        } else {
          // multiunit booking
          const unitIds = booking.units.map((u) => u.id);
          const units = await fastify.mongodb.translationMultiunit
            .find({ id: { $in: unitIds } })
            .lean();

          for (const unit of units) {
            const bookingUnit = booking.units.find((u) => u.id === unit.id);
            const lang = client?.session?.language;
            const unitTitle =
              unit.languages.find((l) => l.name === lang)?.translation?.title ||
              '';

            rows += addRow(
              unitTitle + ' x' + bookingUnit.quantity + ' - ' + listingTitle,
              formateDate(today),
              (booking.units.find((u) => u.id === unit.id).totalPrice || '00') +
              ' ' +
              booking.currency,
              '-',
            );
            for (const service of booking.services) {
              if (service?.unitId !== unit.id) continue;
              rows += addRow(
                service.name + ' - ' + unitTitle,
                formateDate(today),
                (service.price || '00') + ' ' + booking.currency,
                '-',
              );
            }
            for (const tax of booking.taxes) {
              if (tax?.unitId !== unit.id) continue;
              rows += addRow(
                tax.name + ' - ' + unitTitle,
                formateDate(today),
                (tax.price || '00') + ' ' + booking.currency,
                '-',
              );
            }
          }
        }

        for (const discount of booking.discounts) {
          rows += addRow(
            discount.name,
            formateDate(today),
            (discount.price || '00') + ' ' + booking.currency,
            '-',
          );
        }

        return rows;
      };
      const informalCheckIn = booking.informal.checkIn;
      const informalCheckOut = booking.informal.checkOut;

      const html = async () => {
        const rows = await generateRows();
        return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>RStays Receipt</title>
<style>
    body {
      font-family: "Helvetica", sans-serif;
      margin: 40px 0px;
      color: #333;
    }

    /* Header */
    .header {
      margin: 40px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .header h1 {
      color: #d43ef5;
      font-size: 24px;
      margin: 0;
    }

    /* Booking details */
    .details {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      margin-top: 20px;
      padding: 10px 50px;
      display: flex;
      justify-content: space-between;
      border-top: 3px solid #f5f5f5;
      border-bottom: 3px solid #f5f5f5;
      font-size: 13px;
      background: #f5f5f5;
    }
    .details div {
    	color: #747474;
       display: flex;
  flex-direction: column;
     }
    .details div span {

      font-size: 14px;
      margin-top: 4px;
      color: black;
    }
    


    table {
  width: 90%;
  margin: 30px 5%;
  border-collapse: separate;  
  border-spacing: 0;        
  font-size: 14px;
  background: #f5f5f5;
  border: 1px solid rgba(0, 0, 0, 0.1); 
  border-radius: 10px;       
  overflow: hidden;      
}

thead th {
  background: rgba(0, 0, 0, 0.1);
  border: 0px;
}

thead th:first-child {
  border-top-left-radius: 9px;
}
thead th:last-child {
  border-top-right-radius: 9px;
}

tbody tr:last-child td:first-child {
  border-bottom-left-radius: 10px;
}
tbody tr:last-child td:last-child {
  border-bottom-right-radius: 10px;
}

th, td {
  padding: 10px;
  text-align: left;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
}
    /* Balance row */
    .balance {
     margin: 40px;
      font-weight: bold;
      font-size: 16px;
      margin-top: 20px;
      display: flex;
      justify-content: space-between;
      padding: 15px 5px;
    }

    /* Footer note */
    .footer {
      font-size: 11px;
      color: #555;
      margin: 50px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <img src="https://rstays-space.fra1.cdn.digitaloceanspaces.com/Frame%2010.svg" alt="Logo"  />
  </div>

  <!-- Booking details -->
  <div class="details">
    <div>
      Check-in / Check-out
      <span>
${formateDate(informalCheckIn)} - ${formateDate(informalCheckOut)}
</span>
    </div>
    <div>
      Number of nights
      <span>${nights}</span>
    </div>
    <div>
      Guest breakdown
      <span>${totalGuests}</span>
    </div>
    <div>
      Booking ID
      <span>${booking.id}</span>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Date</th>
        <th>Debit</th>
        <th>Credit</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody >
  </table >

  <div class="balance">
    <div>Total Balance</div>
    <div>${(booking.totalPrice || '00') + booking.currency}</div>
  </div>

  <div class="footer">
    All prices are listed in Units. One Unit is equal to one US Dollar.<br />
    Cash or credit card payment is accepted in Dollar by the hotel exchange 
rate on the day of payment.<br />
    Hotel exchange rate: 1 Unit - xx.xx USD. Total invoice in USD: XXXXX.XX
  </div>
</body >
</html >


  `;
      };
      const htmlStrucutre = await html();

      const pdf = await generatePdfFromHtml(htmlStrucutre);

      const headers = {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="receipt.pdf"',
      };
      return { file: pdf, headers };
    },
    schema: {
      tags: ['Booking'],
      summary: 'Download booking receipt PDF',
      description:
        'Generate and download a professionally formatted PDF receipt ' +
        'for a booking. Includes check-in/out dates, guest count, ' +
        'itemized charges (accommodation, services, taxes), discounts, ' +
        'and total balance. Localized pricing based on user language. ' +
        'Only accessible by booking owner or admin.',
      body: {
        type: 'object',
        required: ['token', 'bookingId'],
        properties: {
          bookingId: { type: 'string' },
          token: { type: 'string', description: 'Session token' },
        },
      },
      response: {
        200: {
          description: 'PDF receipt',
          type: 'string',
          content: {
            'text/pdf': {
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
