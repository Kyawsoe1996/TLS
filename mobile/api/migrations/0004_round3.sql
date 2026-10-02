-- TLS mobile API - round 3: shop details (email footer / Reply-To), garment types + more measurements, order prices.
-- SQLite / libSQL only allows one column per ALTER TABLE, so each column is its own statement.

-- Shop details, all optional. Shown in the footer of every email sent from the app.
ALTER TABLE shops ADD COLUMN address TEXT;
ALTER TABLE shops ADD COLUMN phone TEXT;
ALTER TABLE shops ADD COLUMN opening_hours TEXT;
ALTER TABLE shops ADD COLUMN reply_to_email TEXT;

-- Fittings: which measurement set applies ('jacket' | 'trousers' | 'shirt' | 'suit') + the extra measurements (cm).
ALTER TABLE fittings ADD COLUMN garment_type TEXT NOT NULL DEFAULT 'jacket';
ALTER TABLE fittings ADD COLUMN hip REAL;
ALTER TABLE fittings ADD COLUMN inseam REAL;
ALTER TABLE fittings ADD COLUMN outseam REAL;
ALTER TABLE fittings ADD COLUMN thigh REAL;
ALTER TABLE fittings ADD COLUMN hem REAL;
ALTER TABLE fittings ADD COLUMN neck REAL;
ALTER TABLE fittings ADD COLUMN cuff REAL;
ALTER TABLE fittings ADD COLUMN shirt_length REAL;

-- Orders: price tracking in Thai baht (balance = price - deposit is computed by the API, not stored).
ALTER TABLE orders ADD COLUMN price REAL;
ALTER TABLE orders ADD COLUMN deposit REAL;
