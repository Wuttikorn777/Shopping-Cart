const { createClient } = require('redis');

const client = createClient({
  socket: { host: 'localhost', port: 6379 },
});

client.on('error', (err) => console.log('Redis Client Error', err));
client
  .connect()
  .then(() => console.log('Connected to Redis'))
  .catch((err) => console.error('Failed to connect to Redis:', err));

// Clear cart
const clearCart = async (username) => {
  try {
    const keys = await client.keys(`cart:${username}:item:*`);
    if (keys.length > 0) {
      await client.del(...keys);
      console.log(`🧹 Cleared cart for ${username}`);
    } else {
      console.log(`🧹 No items to clear for ${username}`);
    }
  } catch (err) {
    console.error(`❌ Failed to clear cart for ${username}:`, err);
    throw err;
  }
};

// Add item to cart
const addItemToCart = async (userId, itemId, name, quantity, price) => {
  try {
    // Input validation:
    if (!userId || !itemId || !name || quantity === undefined || price === undefined) {
      return { error: '❌ Missing required fields' };
    }

    const parsedQuantity = parseInt(quantity, 10);
    const parsedPrice = parseFloat(price);

    if (isNaN(parsedQuantity) || isNaN(parsedPrice) || parsedQuantity <= 0) {
      return { error: '❌ Invalid quantity or price' };
    }

    const productKey = `products:${itemId}`; // Consistent key naming
    const cartItemKey = `cart:${userId}:item:${itemId}`;

    const productStr = await client.hGet('products', itemId);
    if (!productStr) return { error: '❌ Product not found' };

    const product = JSON.parse(productStr);
    if (product.stock < parsedQuantity) return { error: '❌ Not enough stock' };

    // Use a Redis transaction for atomicity:
    const multi = client.multi();
    multi.hSet('products', itemId, JSON.stringify({ ...product, stock: product.stock - parsedQuantity })); // Update stock

    // Check if item already exists in cart
    const existingQuantityStr = await client.hGet(cartItemKey, 'quantity');
    if (existingQuantityStr) {
      const existingQuantity = parseInt(existingQuantityStr, 10);
      multi.hSet(cartItemKey, 'quantity', existingQuantity + parsedQuantity);
    } else {
      multi.hSet(cartItemKey, { name, quantity: parsedQuantity, price: parsedPrice });
    }
    const results = await multi.exec();

    if (!results || results.some((result) => result === null || result instanceof Error)) {
      return { error: '❌ Transaction failed' };
    }
    return { success: `✅ Item "${name}" added to cart` };
  } catch (err) {
    console.error('❌ Error adding item to cart:', err);
    return { error: '❌ Error adding item to cart' }; // Consistent error return
  }
};

// Get items in cart
const getCartItems = async (userId) => {
  try {
    const keys = await client.keys(`cart:${userId}:item:*`);
    const cart = {};
    for (const key of keys) {
      const itemData = await client.hGetAll(key);
      if (itemData) {
        cart[key] = itemData;
      }
    }
    return cart;
  } catch (err) {
    console.error('❌ Error fetching cart items:', err);
    return { error: '❌ Error fetching cart items' }; // Consistent error return
  }
};

module.exports = { clearCart, addItemToCart, getCartItems };