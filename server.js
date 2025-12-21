const express = require('express');
const session = require('express-session');
const { RedisStore } = require('connect-redis');
const { createClient } = require('redis');
const path = require('path');
const bcrypt = require('bcrypt');
const QRCode = require('qrcode');

const app = express();
const saltRounds = 10;

// Setup view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Redis Client
const client = createClient({
  socket: { host: 'localhost', port: 6379 }
});

client.connect()
  .then(async () => {
    console.log('✅ Connected to Redis');
    const products = await client.hGetAll('products');
    if (Object.keys(products).length === 0) {
      const initialProducts = [
        { id: 1, name: 'T-shirt', price: 2, stock: 10 },
        { id: 2, name: 'Apple', price: 2, stock: 10 },
        { id: 3, name: 'Banana', price: 1, stock: 15 },
        { id: 4, name: 'Milk', price: 3, stock: 8 },
        { id: 5, name: 'Bread', price: 2, stock: 12 },
        { id: 6, name: 'Sushi', price: 2, stock: 12 },
        { id: 7, name: 'Ice cream', price: 3, stock: 6 },
        { id: 8, name: 'Ramen', price: 2, stock: 9 },
        { id: 9, name: 'Cheese', price: 2, stock: 2 },
        { id: 10, name: 'Noodle', price: 3, stock: 20 },
      ];
      for (const p of initialProducts) {
        await client.hSet('products', p.id, JSON.stringify(p));
      }
      console.log('📦 Initialized products');
    }
  })
  .catch(console.error);

// Session Middleware
app.use(session({
  store: new RedisStore({ client }),
  secret: 'my-secret',
  resave: false,
  saveUninitialized: false
}));

// Middlewares
const isLoggedIn = (req, res, next) => {
  if (!req.session.username) {
    return res.status(401).send('🔒 Please login first');
  }
  next();
};

const validateUserMatch = (req, res, next) => {
  if (req.session.username !== req.params.userId) {
    return res.status(403).send('🚫 Forbidden: User mismatch');
  }
  next();
};

// Pages
app.get('/', async (req, res) => {
  const productsData = await client.hGetAll('products');
  const products = Object.entries(productsData).map(([id, value]) => ({ id, ...JSON.parse(value) }));

   console.log('🛒 Products:', products);

  let cartItems = [];
  let total = 0;

  if (req.session.username) {
    const keys = await client.keys(`cart:${req.session.username}:item:*`);
    for (const key of keys) {
      const item = await client.hGetAll(key);
      cartItems.push({
        id: key.split(':')[3],
        name: item.name,
        quantity: parseInt(item.quantity, 10),
        price: parseFloat(item.price)
      });
      total += item.price * item.quantity;
    }
  }

  res.render('index', {
    products,
    username: req.session.username || 'Guest',
    cart: cartItems,
    total: total.toFixed(2)
  });
});

app.get('/login', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const exists = await client.hExists(`user:${username}`, 'password');
  if (exists) return res.status(400).send('❌ User already exists.');

  const hashedPassword = await bcrypt.hash(password, saltRounds);
  await client.hSet(`user:${username}`, 'password', hashedPassword);
  res.redirect('/login');
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const hashed = await client.hGet(`user:${username}`, 'password');
  if (!hashed) return res.status(400).send('❌ User not found.');

  const match = await bcrypt.compare(password, hashed);
  if (!match) return res.status(401).send('❌ Invalid credentials.');

  req.session.username = username;
  res.redirect('/');
});

app.get('/logout', (req, res) => {
  if (req.session.username) {
    req.session.destroy(err => {
      if (err) return res.status(500).send('Logout failed');
      res.redirect('/login');
    });
  } else {
    res.redirect('/login');
  }
});

// --- Cart ---
app.get('/cart/:userId', isLoggedIn, validateUserMatch, async (req, res) => {
  const { userId } = req.params;
  const keys = await client.keys(`cart:${userId}:item:*`);
  const cart = {};

  for (const key of keys) {
    const item = await client.hGetAll(key);
    const itemId = key.split(':')[3];
    cart[itemId] = {
      name: item.name,
      quantity: parseInt(item.quantity),
      price: parseFloat(item.price)
    };
  }
  res.json({ cart });
});

app.post('/cart/:userId/add', isLoggedIn, validateUserMatch, async (req, res) => {
  const { userId } = req.params;
  const { itemId, quantity } = req.body;
  const key = `cart:${userId}:item:${itemId}`;

  const exists = await client.exists(key);
  
  if (exists) {
    await client.hIncrBy(key, 'quantity', quantity);
  } else {
    const productStr = await client.hGet('products', itemId);
    const product = JSON.parse(productStr);
    if (!product) return res.status(404).send('Product not found');

    await client.hSet(key, { name: product.name, price: product.price, quantity });
  }
  res.send('Product added');
});

app.post('/cart/:userId/update', isLoggedIn, validateUserMatch, async (req, res) => {
  const { userId } = req.params;
  const { itemId, action } = req.body;
  const key = `cart:${userId}:item:${itemId}`;
  const quantity = parseInt(await client.hGet(key, 'quantity'));

  console.log('🛒 Cart action:', action);

  if (action === 'increase') {
    await client.hIncrBy(key, 'quantity', 1);
  } else if (action === 'decrease') {
    if (quantity <= 1) {
      await client.del(key);
    } else {
      await client.hIncrBy(key, 'quantity', -1);
    }
  }
  res.send('Cart updated');
});

app.post('/cart/:userId/remove', isLoggedIn, validateUserMatch, async (req, res) => {
  const { userId } = req.params;
  const { itemId } = req.body;

  console.log('🛒 Removing item:', itemId);
  await client.del(`cart:${userId}:item:${itemId}`);
  res.send('Item removed');
});

app.post('/cart/:userId/clear', isLoggedIn, validateUserMatch, async (req, res) => {
  const { userId } = req.params;
  const keys = await client.keys(`cart:${userId}:item:*`);
  if (keys.length) await client.del(...keys);
  console.log('Cart cleared');
});

// --- Checkout ---
app.get('/checkout', isLoggedIn, async (req, res) => {
  const username = req.session.username;
  const keys = await client.keys(`cart:${username}:item:*`);
  const cartItems = [];

  let total = 0;
  for (const key of keys) {
    const item = await client.hGetAll(key);
    cartItems.push({ name: item.name, quantity: item.quantity, price: item.price });
    total += item.price * item.quantity;
  }

  res.render('checkout', { username, cartItems, total });
});

app.post('/checkout', isLoggedIn, async (req, res) => {
  try {
    const username = req.session.username;
    const cartKeys = await client.keys(`cart:${username}:item:*`);
    let total = 0;

    for (const key of cartKeys) {
      const itemData = await client.hGetAll(key);
      const product = JSON.parse(await client.hGet('products', key.split(':')[3]));

      if (product.stock < itemData.quantity) throw new Error('Not enough stock');

      product.stock -= itemData.quantity;
      await client.hSet('products', key.split(':')[3], JSON.stringify(product));

      total += itemData.price * itemData.quantity;
      await client.del(key);
    }
    res.redirect('/thankyou');
  } catch (err) {
    console.error(err);
    res.status(500).send('Checkout failed');
  }
});

// --- Payment QR ---
app.get('/payment/qr', isLoggedIn, (req, res) => {
  const url = '/images/qr-code-placeholder.jpg';
  QRCode.toDataURL(url, (err, qrUrl) => {
    if (err) return res.render('qr-payment', { username: req.session.username, qrCodeUrl: url });
    res.render('qr-payment', { username: req.session.username, qrCodeUrl: qrUrl });
  });
});

app.get('/place-order', isLoggedIn, (req, res) => {
  res.render('checkout', { username: req.session.username });
});

app.post('/place-order', isLoggedIn, async (req, res) => {
  try {
    const username = req.session.username;
    const keys = await client.keys(`cart:${username}:item:*`);
    const orderItems = [];
    let total = 0;

    for (const key of keys) {
      const item = await client.hGetAll(key);
      const productId = key.split(':')[3];
      const product = JSON.parse(await client.hGet('products', productId));

      if (product.stock < item.quantity) {
        return res.status(400).send(`❌ Not enough stock for ${product.name}`);
      }

      // Update stock
      product.stock -= item.quantity;
      await client.hSet('products', productId, JSON.stringify(product));

      orderItems.push({
        id: productId,
        name: item.name,
        quantity: parseInt(item.quantity),
        price: parseFloat(item.price)
      });
      total += item.quantity * item.price;
    }

    // Save order
    const timestamp = Date.now();
    const orderKey = `order:${username}:${timestamp}`;
    await client.hSet(orderKey, {
      items: JSON.stringify(orderItems),
      total: total.toFixed(2),
      timestamp
    });

    // Clear cart
    if (keys.length) await client.del(...keys);

    res.redirect('/thankyou');
  } catch (err) {
    console.error('❌ Error placing order:', err);
    res.status(500).send('Failed to place order');
  }
});


// --- Thank You ---
app.get('/thankyou', isLoggedIn, (req, res) => {
  res.render('thankyou', { username: req.session.username });
});

// Start server
app.listen(3000, () => console.log('🚀 Server running http://localhost:3000'));
