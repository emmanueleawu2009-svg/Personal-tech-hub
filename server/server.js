const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');

require('dotenv').config({
  path: path.join(__dirname, '..', '.env')
});

const app = express();

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';

const ROOT_DIR = path.join(__dirname, '..');
const ORDERS_FILE = path.join(ROOT_DIR, 'data', 'orders.json');

const SERVICES = {
  powerpoint: {
    name: 'PowerPoint Design',
    price: 5000
  },
  word: {
    name: 'Word Services',
    price: 3500
  },
  graphic: {
    name: 'Graphic Design',
    price: 5000
  },
  makeover: {
    name: 'Presentation Makeover',
    price: 6000
  }
};

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

app.use(express.json());

// Serve the website's real files:
// CSS, JavaScript, images, video, SVG, etc.
app.use(
  express.static(ROOT_DIR, {
    index: false
  })
);

// Payment completion page
app.get('/payment-complete.html', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'payment-complete.html'));
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    message: 'Personal Tech Hub server is running.'
  });
});

// Get available services
app.get('/api/services', (_req, res) => {
  res.json(SERVICES);
});

// Read saved orders
function readOrders() {
  try {
    if (!fs.existsSync(ORDERS_FILE)) {
      fs.mkdirSync(path.dirname(ORDERS_FILE), {
        recursive: true
      });

      fs.writeFileSync(
        ORDERS_FILE,
        '[]',
        'utf8'
      );
    }

    const contents = fs.readFileSync(
      ORDERS_FILE,
      'utf8'
    );

    return JSON.parse(contents || '[]');
  } catch (error) {
    console.error('Could not read orders:', error);
    return [];
  }
}

// Save orders
function writeOrders(orders) {
  fs.mkdirSync(path.dirname(ORDERS_FILE), {
    recursive: true
  });

  fs.writeFileSync(
    ORDERS_FILE,
    JSON.stringify(orders, null, 2),
    'utf8'
  );
}

// Create a new project request
app.post('/api/orders', (req, res) => {
  const {
    name,
    email,
    phone,
    service,
    details,
    budget
  } = req.body || {};

  if (!name || !email || !service || !details) {
    return res.status(400).json({
      ok: false,
      message:
        'Please provide your name, email, service and project details.'
    });
  }

  const selectedService = SERVICES[service];

  if (!selectedService) {
    return res.status(400).json({
      ok: false,
      message: 'Please select a valid service.'
    });
  }

  const order = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: 'request_received',
    name: String(name).trim(),
    email: String(email).trim(),
    phone: String(phone || '').trim(),
    service,
    serviceName: selectedService.name,
    starterPrice: selectedService.price,
    budget: String(budget || '').trim(),
    details: String(details).trim()
  };

  const orders = readOrders();

  orders.push(order);

  writeOrders(orders);

  res.status(201).json({
    ok: true,
    message:
      'Project request received. Thank you — I will review it and get back to you.',
    orderId: order.id
  });
});

// Initialize Paystack payment
app.post('/api/payments/initialize', async (req, res) => {
  try {
    const {
      email,
      service,
      name
    } = req.body || {};

    if (!email || !service) {
      return res.status(400).json({
        ok: false,
        message: 'Email and service are required.'
      });
    }

    const selectedService = SERVICES[service];

    if (!selectedService) {
      return res.status(400).json({
        ok: false,
        message: 'Invalid service selected.'
      });
    }

    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        ok: false,
        message:
          'Paystack is not configured yet. Add your Paystack test secret key to .env.'
      });
    }

    const reference =
      `PTH-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const response = await fetch(
      'https://api.paystack.co/transaction/initialize',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: String(email).trim(),
          amount: selectedService.price * 100,
          reference,
          callback_url: `${BASE_URL}/payment-complete.html`,
          metadata: {
            customer_name: String(name || '').trim(),
            service: selectedService.name
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok || !data.status) {
      console.error('Paystack initialization failed:', data);

      return res.status(502).json({
        ok: false,
        message:
          data.message || 'Could not initialize Paystack payment.'
      });
    }

    res.json({
      ok: true,
      authorizationUrl: data.data.authorization_url,
      reference: data.data.reference
    });
  } catch (error) {
    console.error('Payment initialization error:', error);

    res.status(500).json({
      ok: false,
      message: 'Payment initialization failed.'
    });
  }
});

// Verify Paystack payment
app.get('/api/payments/verify/:reference', async (req, res) => {
  try {
    const reference = req.params.reference;

    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        ok: false,
        message: 'Paystack is not configured.'
      });
    }

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(
        reference
      )}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
        }
      }
    );

    const data = await response.json();

    if (!response.ok || !data.status) {
      return res.status(400).json({
        ok: false,
        message:
          data.message || 'Could not verify payment.'
      });
    }

    const transaction = data.data;

    const serviceName =
      transaction?.metadata?.service || 'Unknown service';

    const expectedService = Object.values(SERVICES).find(
      (service) => service.name === serviceName
    );

    const expectedAmount = expectedService
      ? expectedService.price * 100
      : null;

    const amountMatches =
      expectedAmount === null ||
      Number(transaction.amount) === Number(expectedAmount);

    const successful =
      transaction.status === 'success' && amountMatches;

    if (successful) {
      const orders = readOrders();

      orders.push({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        status: 'payment_verified',
        reference: transaction.reference,
        email: transaction.customer?.email || '',
        name:
          transaction.metadata?.customer_name || '',
        service: serviceName,
        amount: transaction.amount,
        currency: transaction.currency
      });

      writeOrders(orders);
    }

    res.json({
      ok: true,
      paid: successful,
      status: transaction.status,
      reference: transaction.reference
    });
  } catch (error) {
    console.error('Payment verification error:', error);

    res.status(500).json({
      ok: false,
      message: 'Payment verification failed.'
    });
  }
});

// Paystack webhook
app.post(
  '/api/payments/webhook',
  express.raw({
    type: 'application/json'
  }),
  (req, res) => {
    try {
      const signature = req.headers['x-paystack-signature'];

      if (!PAYSTACK_SECRET_KEY) {
        return res.sendStatus(500);
      }

      const hash = crypto
        .createHmac(
          'sha512',
          PAYSTACK_SECRET_KEY
        )
        .update(req.body)
        .digest('hex');

      if (
        !signature ||
        !crypto.timingSafeEqual(
          Buffer.from(hash),
          Buffer.from(signature)
        )
      ) {
        return res.sendStatus(401);
      }

      const event = JSON.parse(req.body.toString('utf8'));

      console.log(
        `Paystack webhook received: ${event.event}`
      );

      return res.sendStatus(200);
    } catch (error) {
      console.error('Webhook error:', error);

      return res.sendStatus(400);
    }
  }
);

// Frontend fallback
app.use((_req, res) => {
  res.sendFile(
    path.join(ROOT_DIR, 'index.html')
  );
});

app.listen(PORT, () => {
  console.log(
    `Personal Tech Hub running at ${BASE_URL}`
  );
});