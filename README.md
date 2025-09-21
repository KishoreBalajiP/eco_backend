# eco_backend

## Overview
This Node.js backend powers an e-commerce platform, providing RESTful APIs for authentication, admin controls, cart, chatbot, orders, payments, products, and email notifications. Modular middleware and routes handle business logic and secure user interactions.

## Folder Structure
```
.
├── db.js              # Database connection (PostgreSQL)
├── migrations.sql     # SQL schema for users, products, cart, orders, etc.
├── package.json       # Project metadata and dependencies
├── server.js          # Main Express server setup and route registration
├── middleware/        # Custom Express middlewares
│   ├── admin.js       # Admin role check middleware
│   └── auth.js        # JWT authentication middleware
├── routes/            # API route handlers
│   ├── admin.js       # Admin-only endpoints (products, orders, users)
│   ├── auth.js        # User registration and login
│   ├── cart.js        # Cart management endpoints
│   ├── chatbot.js     # Chatbot message endpoint
│   ├── orders.js      # Order creation and retrieval
│   ├── payments.js    # Payment integration (Razorpay)
│   └── products.js    # Product listing and details
├── utils/             # Utility functions
│   └── email.js       # Order confirmation email sender
```

## API Endpoints

### Auth
- **POST /api/auth/register**
  - Registers a new user.
  - **Request Body:** `{ email, password, name }`
  - **Response:** `{ user, token }`
- **POST /api/auth/login**
  - Logs in a user.
  - **Request Body:** `{ email, password }`
  - **Response:** `{ user, token }`

### Products
- **GET /api/products**
  - List products (search, pagination).
  - **Query:** `q` (search), `page`, `limit`
  - **Response:** `{ products: [...] }`
- **GET /api/products/:id**
  - Get product details.
  - **Response:** `{ product }`

### Cart
- **GET /api/cart**
  - Get user's cart items (auth required).
  - **Headers:** `Authorization: Bearer <token>`
  - **Response:** `{ cart: [...] }`
- **POST /api/cart/add**
  - Add product to cart (auth required).
  - **Request Body:** `{ product_id, quantity }`
  - **Response:** `{ message, cart }`
- **POST /api/cart/remove**
  - Remove product from cart (auth required).
  - **Request Body:** `{ product_id }`
  - **Response:** `{ message, cart }`

### Orders
- **POST /api/orders/create**
  - Create an order from cart (auth required).
  - **Request Body:** `{ shipping, payment_method, currency }`
  - **Response:** `{ orderId, total }`
- **GET /api/orders/:id**
  - Get order details (auth required).
  - **Response:** `{ order, items }`

### Payments
- **POST /api/payments/create-order**
  - Create a Razorpay payment order (auth required).
  - **Request Body:** `{ orderId, currency }`
  - **Response:** `{ id, amount, currency, receipt }`
- **POST /api/payments/verify**
  - Verify payment webhook (auth required).
  - **Response:** `{ ok: true }`

### Chatbot
- **POST /api/chatbot/message**
  - Send a message to the AI chatbot (auth required).
  - **Request Body:** `{ message, sessionId? }`
  - **Response:** `{ reply }`

### Admin (all require admin role)
- **POST /api/admin/products**
  - Add a new product.
  - **Request Body:** `{ name, description, price, stock, image_url }`
  - **Response:** `{ product }`
- **PUT /api/admin/products/:id**
  - Update a product.
  - **Request Body:** `{ name, description, price, stock, image_url }`
  - **Response:** `{ product }`
- **DELETE /api/admin/products/:id**
  - Delete a product.
  - **Response:** `{ message }`
- **GET /api/admin/orders**
  - View all orders.
  - **Response:** `[ ...orders ]`
- **PATCH /api/admin/orders/:id/status**
  - Update order status.
  - **Request Body:** `{ status }`
  - **Response:** `{ order }`
- **GET /api/admin/users**
  - List all users.
  - **Response:** `[ ...users ]`

## Middleware
- **authMiddleware**: Checks JWT token, attaches user to request.
- **isAdmin**: Checks if user has admin role.

## Utils
- **sendOrderEmail**: Sends order confirmation emails using SMTP.

## Database
- PostgreSQL tables for users, products, cart_items, orders, order_items.

---


## New Features & Updates (2025)

### 1. OTP-based Password Reset
- Added `/api/auth/forgot-password` to request password reset OTP
- `/api/auth/verify-otp` to verify OTP
- `/api/auth/reset-password` to reset password after OTP verification
- New table: `password_otps` for OTP storage

### 2. Product Image Upload via S3
- Admin product creation and update support image upload to AWS S3
- Uses `multer` for file upload and `aws-sdk` for S3 integration

### 3. User Role Management
- Admins can update user roles via `/api/admin/users/:id/role`

### 4. Order Confirmation Email
- Sends professional HTML order confirmation emails using SMTP

### 5. OpenAI-powered Chatbot
- `/api/chatbot/message` uses OpenAI API for customer support

### 6. Health Check Endpoint
- `/api/health` returns `{ ok: true }` for server status

### 7. Search History Table
- New table: `search_history` for tracking user searches

### 8. Improved Cart and Order APIs
- Cart and order endpoints now return `totalItems` and `totalAmount`

### 9. Environment Variables
- Uses `.env` for secrets (DB, SMTP, AWS, OpenAI, JWT, etc.)

---

For more details, see each route file in `routes/` and middleware in `middleware/`.
