const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const config = require('./env');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Attendance API',
      version: '1.0.0',
      description: 'Versioned REST API for attendance, payroll, and locations.',
    },
    servers: [{ url: `http://127.0.0.1:${config.port}` }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: [path.join(__dirname, '../routes/v1/**/*.js')],
};

module.exports = { swaggerSpec: () => swaggerJsdoc(options) };
