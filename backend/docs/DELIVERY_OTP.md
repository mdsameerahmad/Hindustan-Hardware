# Customer Delivery OTP

New COD orders receive a backend-generated six-digit delivery OTP. Checkout stores a keyed SHA-256 digest for verification and an AES-256-GCM encrypted copy so the customer can view the code later. The customer order-details API decrypts the code only after checking that the authenticated user owns the order. Order summaries and admin/delivery APIs do not include it.

## Encryption key

Set `DELIVERY_OTP_ENCRYPTION_KEY` in the backend environment before deploying the checkout changes. Generate a distinct 32-byte key and store its Base64 output as a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Use the same key for local development and the production backend. Keep it stable: changing it makes encrypted OTPs on existing active orders unreadable.

## Database migration

Apply `migrations/012_generate_delivery_otp_with_order.sql` after migrations 001 through 011. It adds OTP storage columns and replaces the atomic checkout function with a version that stores the OTP digest and ciphertext in the same transaction as order creation.

The customer order-success and order-details pages display the OTP and remind the customer to share it only when the order is handed over.

## Delivery verification

Apply `migrations/013_verify_delivery_otp.sql` after migration 012. The assigned delivery partner submits the code through `POST /api/v1/deliveries/:deliveryId/verify-otp` once the delivery is out for delivery. The database verifies the keyed digest and atomically updates both the assignment and order. Codes expire seven days after order creation; five incorrect attempts lock verification for that order. Direct assignment and administrator status updates cannot mark an order delivered.
