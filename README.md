# eco_backend

## Overview
This Node.js backend powers an e-commerce platform, providing RESTful APIs for authentication, admin controls, cart, chatbot, orders, payments, products, user shipping management, and email notifications. Modular middleware and routes handle business logic and secure user interactions. The chatbot now uses the Google Gemini API for customer support.

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
│   ├── otpAuth.js     # OTP-based password reset endpoints
│   └── user.js        # User shipping address management
├── utils/             # Utility functions
│   └── email.js       # Order confirmation email sender
│   └── s3.js          # AWS S3 integration for image uploads
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
  - Uses Google Gemini API for AI-powered responses.
### User Shipping
- **GET /api/users/me/shipping**
  - Get current user's shipping address (auth required).
  - **Response:** `{ shipping_name, shipping_mobile, ... }`
- **PUT /api/users/me/shipping**
  - Update current user's shipping address (auth required).
  - **Request Body:** `{ shipping_name, shipping_mobile, ... }`
  - **Response:** `{ message }`

### OTP-based Password Reset
- **POST /api/auth/forgot-password**
  - Request password reset OTP.
  - **Request Body:** `{ email }`
  - **Response:** `{ success, message }`
- **POST /api/auth/verify-otp**
  - Verify OTP for password reset.
  - **Request Body:** `{ email, otp }`
  - **Response:** `{ success, message }`
- **POST /api/auth/reset-password**
  - Reset password after OTP verification.
  - **Request Body:** `{ email, otp, newPassword }`
  - **Response:** `{ success, message }`

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
- **authMiddleware**: Checks JWT token, attaches user to request. Required for all endpoints except registration, login, and OTP reset.
- **isAdmin**: Checks if user has admin role. Used for all `/api/admin` endpoints.

## Utils
- **sendOrderEmail**: Sends order confirmation emails using SMTP.
- **s3.js**: Handles AWS S3 integration for product image uploads (admin endpoints).

## Database
- PostgreSQL tables for users, products, cart_items, orders, order_items, password_otps, search_history.

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

### 5. Gemini-powered Chatbot
- `/api/chatbot/message` uses Google Gemini API for customer support

### 6. Health Check Endpoint
- `/api/health` returns `{ ok: true }` for server status

### 7. Search History Table
- New table: `search_history` for tracking user searches

### 8. Improved Cart and Order APIs
- Cart and order endpoints now return `totalItems` and `totalAmount`

### 9. Environment Variables
- Uses `.env` for secrets (DB, SMTP, AWS, OpenAI, JWT, etc.)

---

---

## Changelog (2025)
- Switched chatbot to Google Gemini API
- Added `/api/users` endpoints for shipping address management
- Improved OTP-based password reset flow
- Admin product image upload now uses AWS S3
- All sensitive config/secrets are managed via `.env`

For more details, see each route file in `routes/` and middleware in `middleware/`.
