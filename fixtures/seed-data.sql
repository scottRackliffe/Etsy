PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO settings(key, value, updated_at)
VALUES
  ('etsy.active_shop_id', '', datetime('now')),
  ('etsy.oauth.state', '', datetime('now')),
  ('etsy.oauth.verifier', '', datetime('now')),
  ('etsy.oauth.access_token_encrypted', '', datetime('now')),
  ('etsy.oauth.refresh_token_encrypted', '', datetime('now')),
  ('app.session.current_user_id', 'local-admin', datetime('now'));

INSERT OR IGNORE INTO inventory(
  item_number, description, purchase_cost, shipping_cost, status, quantity, category_tags, created_at, updated_at
)
VALUES
  ('INV-1001', 'Vintage teacup and saucer set', 12.50, 4.25, 'draft', 1, 'vintage,tea,porcelain', datetime('now'), datetime('now')),
  ('INV-1002', 'Brass candlestick pair', 24.00, 6.10, 'draft', 1, 'brass,decor,home', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO customers(
  first_name, last_name, email, city, state, postal_code, country, created_at, updated_at
)
VALUES
  ('Avery', 'Morgan', 'avery@example.com', 'Nashville', 'TN', '37203', 'US', datetime('now'), datetime('now')),
  ('Jordan', 'Lee', 'jordan@example.com', 'Austin', 'TX', '73301', 'US', datetime('now'), datetime('now'));
