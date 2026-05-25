-- ADR-069 sample/demo dataset. Loaded by POST /api/seed/sample-data (idempotent guard in API).
-- Prerequisites: ADR-017 schema. tracking_number UPDATE at end requires orders.tracking_number migration (ADR-031).
PRAGMA foreign_keys = ON;

INSERT INTO inventory (
  item_number, description, purchase_cost, shipping_cost, sale_revenue,
  date_purchased, date_listed, date_of_sale, shipping_date,
  picture_1, condition_code, status, quantity, category_tags, notes,
  listing_title, listing_description, listing_tags,
  listing_draft_state, listing_draft_source,
  created_at, updated_at
) VALUES
('SAMPLE-001', 'Vintage Fiesta Ware Pitcher, Red', 18.00, 4.00, 65.00,
 '2025-09-12', '2025-10-20', NULL, NULL,
 '/placeholders/sample-1.jpg', 'Excellent', 'Listed', 1, 'vintage,fiesta,ceramic',
 'Demo: Fiesta pitcher',
 'Vintage Fiesta Ware Red Pitcher', 'Classic red Fiesta pitcher in excellent condition.', 'fiesta,vintage,pitcher,red',
 'approved', 'manual', datetime('now'), datetime('now')),
('SAMPLE-002', 'Art Deco Rhinestone Brooch', 12.00, 3.50, 45.00,
 '2025-08-01', NULL, NULL, NULL,
 '/placeholders/sample-2.jpg', 'Mint/Near Mint', 'In stock', 1, 'jewelry,brooch,art-deco',
 'Demo: rhinestone brooch', NULL, NULL, NULL, NULL, NULL, datetime('now'), datetime('now')),
('SAMPLE-003', 'Depression Glass Candy Dish, Pink', 8.50, 3.00, 35.00,
 '2025-07-15', '2025-09-01', NULL, NULL,
 '/placeholders/sample-3.jpg', 'Very Good', 'Listed', 1, 'glass,depression,pink',
 'Demo: candy dish',
 'Pink Depression Glass Candy Dish', 'Lovely pink candy dish with subtle pattern.', 'depression,glass,pink,vintage',
 'approved', 'manual', datetime('now'), datetime('now')),
('SAMPLE-004', 'Mid-Century Teak Salad Bowl Set', 25.00, 6.00, 80.00,
 '2025-06-01', '2025-07-10', '2025-11-05', '2025-11-08',
 '/placeholders/sample-4.jpg', 'Good', 'Sold', 1, 'mid-century,teak,kitchen',
 'Demo: teak bowl set — sold', NULL, NULL, NULL, NULL, NULL, datetime('now'), datetime('now')),
('SAMPLE-005', 'Bakelite Bangle Bracelet, Butterscotch', 30.00, 4.00, 95.00,
 '2025-10-01', NULL, NULL, NULL,
 '/placeholders/sample-5.jpg', 'Excellent', 'Draft', 1, 'bakelite,jewelry,bracelet',
 'Demo: draft bangle', NULL, NULL, NULL, NULL, NULL, datetime('now'), datetime('now')),
('SAMPLE-006', 'Carnival Glass Marigold Bowl', 15.00, 5.00, 55.00,
 '2025-08-20', '2025-09-25', NULL, NULL,
 '/placeholders/sample-6.jpg', 'Very Good', 'Listed', 1, 'carnival,glass,marigold',
 'Demo: carnival bowl',
 'Marigold Carnival Glass Bowl', 'Iridescent marigold carnival glass serving bowl.', 'carnival,glass,bowl,marigold',
 'approved', 'manual', datetime('now'), datetime('now')),
('SAMPLE-007', 'Vintage Pyrex Mixing Bowl, Primary Blue', 10.00, 4.00, 40.00,
 '2025-09-05', NULL, NULL, NULL,
 '/placeholders/sample-7.jpg', 'Excellent', 'Reserved', 1, 'pyrex,kitchen,vintage',
 'Demo: reserved pyrex', NULL, NULL, NULL, NULL, NULL, datetime('now'), datetime('now')),
('SAMPLE-008', 'Sterling Silver Charm Bracelet', 45.00, 5.50, 120.00,
 '2025-05-20', NULL, NULL, NULL,
 '/placeholders/sample-8.jpg', 'Good', 'In stock', 1, 'silver,jewelry,bracelet',
 'Demo: charm bracelet', NULL, NULL, NULL, NULL, NULL, datetime('now'), datetime('now')),
('SAMPLE-009', 'Milk Glass Hobnail Vase', 5.00, 2.00, NULL,
 '2024-12-01', NULL, NULL, NULL,
 '/placeholders/sample-9.jpg', 'Fair/As-Is', 'Retired', 1, 'glass,milk-glass,vase',
 'Demo: retired vase', NULL, NULL, NULL, NULL, NULL, datetime('now'), datetime('now')),
('SAMPLE-010', 'Cast Iron Doorstop, Flower Basket', 22.00, 7.00, 60.00,
 '2025-11-01', NULL, NULL, NULL,
 '/placeholders/sample-10.jpg', 'Good', 'Draft', 1, 'cast-iron,doorstop,decor',
 'Demo: draft doorstop', NULL, NULL, NULL, NULL, NULL, datetime('now'), datetime('now'));

INSERT INTO other_costs (inventory_id, cost_type, amount, note, created_at, updated_at)
SELECT id, 'cleaning', 5.00, 'Professional cleaning before listing', datetime('now'), datetime('now')
FROM inventory WHERE item_number = 'SAMPLE-001';

INSERT INTO other_costs (inventory_id, cost_type, amount, note, created_at, updated_at)
SELECT id, 'repair', 12.00, 'Minor crack repair on one bowl', datetime('now'), datetime('now')
FROM inventory WHERE item_number = 'SAMPLE-004';

INSERT INTO customers (
  first_name, last_name, email, phone,
  address_1, address_2, city, state, postal_code, country,
  notes, created_at, updated_at
) VALUES
('Margaret', 'Chen', 'margaret.chen@example.com', NULL,
 '1420 Oak Street', NULL, 'Portland', 'OR', '97214', 'US',
 'Demo customer', datetime('now'), datetime('now')),
('Robert', 'Williams', 'robert.w@example.com', NULL,
 '8801 Lamar Blvd', 'Apt 4B', 'Austin', 'TX', '78752', 'US',
 'Demo customer', datetime('now'), datetime('now')),
('Susan', 'Park', 'susan.park@example.com', NULL,
 '2200 N Milwaukee Ave', NULL, 'Chicago', 'IL', '60647', 'US',
 'Demo customer', datetime('now'), datetime('now')),
('James', 'Thompson', 'james.t@example.com', NULL,
 '15 Bull Street', NULL, 'Savannah', 'GA', '31401', 'US',
 'Demo customer', datetime('now'), datetime('now')),
('Linda', 'Martinez', 'linda.m@example.com', NULL,
 '3100 Blake St', NULL, 'Denver', 'CO', '80205', 'US',
 'Demo customer', datetime('now'), datetime('now'));

INSERT INTO addresses (
  customer_id, label, first_line, second_line, city, state, postal_code, country,
  is_default, created_at, updated_at
)
SELECT id, 'Home', address_1, address_2, city, state, postal_code, country, 1, datetime('now'), datetime('now')
FROM customers WHERE email = 'margaret.chen@example.com';

INSERT INTO addresses (
  customer_id, label, first_line, second_line, city, state, postal_code, country,
  is_default, created_at, updated_at
)
SELECT id, 'Home', address_1, address_2, city, state, postal_code, country, 1, datetime('now'), datetime('now')
FROM customers WHERE email = 'robert.w@example.com';

UPDATE customers SET default_address_id = (
  SELECT id FROM addresses WHERE customer_id = customers.id AND is_default = 1 LIMIT 1
)
WHERE email IN ('margaret.chen@example.com', 'robert.w@example.com');

INSERT INTO orders (
  order_number, customer_id, order_date, order_status, payment_status, was_paid,
  shipper, seller_shipping_cost, shipping_date,
  ship_to_first_name, ship_to_last_name,
  ship_to_address_line_1, ship_to_address_line_2,
  ship_to_city, ship_to_state_province, ship_to_country, ship_to_postal_code,
  subtotal, shipping_total, tax_total, discount_total, grand_total,
  source_channel, notes, created_at, updated_at
)
SELECT
  'SAMPLE-ORD-001', c.id, '2025-11-05', 'active', 'paid', 1,
  'USPS', 8.50, '2025-11-08',
  c.first_name, c.last_name, c.address_1, c.address_2,
  c.city, c.state, c.country, c.postal_code,
  80.00, 12.00, 6.40, 0, 98.40,
  'manual', 'Demo: shipped teak bowl set', datetime('now'), datetime('now')
FROM customers c WHERE c.email = 'margaret.chen@example.com';

INSERT INTO orders (
  order_number, customer_id, order_date, order_status, payment_status, was_paid,
  etsy_receipt_id, ship_to_first_name, ship_to_last_name,
  ship_to_address_line_1, ship_to_address_line_2,
  ship_to_city, ship_to_state_province, ship_to_country, ship_to_postal_code,
  subtotal, shipping_total, tax_total, discount_total, grand_total,
  source_channel, notes, created_at, updated_at
)
SELECT
  'SAMPLE-ORD-002', c.id, '2025-10-22', 'active', 'paid', 1,
  'SAMPLE-ETSY-2002',
  c.first_name, c.last_name, c.address_1, c.address_2,
  c.city, c.state, c.country, c.postal_code,
  65.00, 9.50, 5.20, 0, 79.70,
  'etsy', 'Demo: Etsy order for Fiesta pitcher', datetime('now'), datetime('now')
FROM customers c WHERE c.email = 'robert.w@example.com';

INSERT INTO orders (
  order_number, customer_id, order_date, order_status, payment_status, was_paid,
  ship_to_first_name, ship_to_last_name,
  ship_to_address_line_1, ship_to_address_line_2,
  ship_to_city, ship_to_state_province, ship_to_country, ship_to_postal_code,
  subtotal, shipping_total, tax_total, discount_total, grand_total,
  source_channel, notes, created_at, updated_at
)
SELECT
  'SAMPLE-ORD-003', c.id, '2025-11-12', 'active', 'unpaid', 0,
  c.first_name, c.last_name, c.address_1, c.address_2,
  c.city, c.state, c.country, c.postal_code,
  55.00, 8.00, 4.40, 0, 67.40,
  'manual', 'Demo: unpaid carnival glass order', datetime('now'), datetime('now')
FROM customers c WHERE c.email = 'susan.park@example.com';

INSERT INTO orders (
  order_number, customer_id, order_date, order_status, payment_status, was_paid,
  ship_to_first_name, ship_to_last_name,
  ship_to_address_line_1, ship_to_address_line_2,
  ship_to_city, ship_to_state_province, ship_to_country, ship_to_postal_code,
  subtotal, shipping_total, tax_total, discount_total, grand_total,
  source_channel, notes, created_at, updated_at
)
SELECT
  'SAMPLE-ORD-004', c.id, '2025-10-30', 'active', 'paid', 1,
  c.first_name, c.last_name, c.address_1, c.address_2,
  c.city, c.state, c.country, c.postal_code,
  35.00, 7.50, 2.80, 0, 45.30,
  'manual', 'Demo: repeat customer Margaret', datetime('now'), datetime('now')
FROM customers c WHERE c.email = 'margaret.chen@example.com';

INSERT INTO orders (
  order_number, customer_id, order_date, order_status, payment_status, was_paid,
  etsy_receipt_id, ship_to_first_name, ship_to_last_name,
  ship_to_address_line_1, ship_to_address_line_2,
  ship_to_city, ship_to_state_province, ship_to_country, ship_to_postal_code,
  subtotal, shipping_total, tax_total, discount_total, grand_total,
  source_channel, notes, created_at, updated_at
)
SELECT
  'SAMPLE-ORD-005', c.id, '2025-11-01', 'active', 'paid', 1,
  'SAMPLE-ETSY-2005',
  c.first_name, c.last_name, c.address_1, c.address_2,
  c.city, c.state, c.country, c.postal_code,
  40.00, 8.00, 3.20, 0, 51.20,
  'etsy', 'Demo: Etsy order for reserved Pyrex', datetime('now'), datetime('now')
FROM customers c WHERE c.email = 'james.t@example.com';

INSERT INTO orders (
  order_number, customer_id, order_date, order_status, payment_status, was_paid,
  ship_to_first_name, ship_to_last_name,
  ship_to_address_line_1, ship_to_address_line_2,
  ship_to_city, ship_to_state_province, ship_to_country, ship_to_postal_code,
  subtotal, shipping_total, tax_total, discount_total, grand_total,
  source_channel, notes, created_at, updated_at
)
SELECT
  'SAMPLE-ORD-006', c.id, '2025-09-18', 'void', 'paid', 1,
  c.first_name, c.last_name, c.address_1, c.address_2,
  c.city, c.state, c.country, c.postal_code,
  45.00, 6.50, 3.60, 0, 55.10,
  'manual', 'Demo: voided brooch order', datetime('now'), datetime('now')
FROM customers c WHERE c.email = 'linda.m@example.com';

INSERT INTO orders (
  order_number, customer_id, order_date, order_status, payment_status, was_paid,
  ship_to_first_name, ship_to_last_name,
  ship_to_address_line_1, ship_to_address_line_2,
  ship_to_city, ship_to_state_province, ship_to_country, ship_to_postal_code,
  subtotal, shipping_total, tax_total, discount_total, grand_total,
  source_channel, notes, created_at, updated_at
)
SELECT
  'SAMPLE-ORD-007', c.id, '2025-11-14', 'active', 'unpaid', 0,
  c.first_name, c.last_name, c.address_1, c.address_2,
  c.city, c.state, c.country, c.postal_code,
  120.00, 10.00, 9.60, 0, 139.60,
  'manual', 'Demo: unpaid charm bracelet order', datetime('now'), datetime('now')
FROM customers c WHERE c.email = 'robert.w@example.com';

INSERT INTO orders (
  order_number, customer_id, order_date, order_status, payment_status, was_paid,
  ship_to_first_name, ship_to_last_name,
  ship_to_address_line_1, ship_to_address_line_2,
  ship_to_city, ship_to_state_province, ship_to_country, ship_to_postal_code,
  subtotal, shipping_total, tax_total, discount_total, grand_total,
  source_channel, notes, created_at, updated_at
)
SELECT
  'SAMPLE-ORD-008', c.id, '2025-11-10', 'cancelled', 'unpaid', 0,
  c.first_name, c.last_name, c.address_1, c.address_2,
  c.city, c.state, c.country, c.postal_code,
  60.00, 9.00, 4.80, 0, 73.80,
  'manual', 'Demo: cancelled doorstop order', datetime('now'), datetime('now')
FROM customers c WHERE c.email = 'susan.park@example.com';

INSERT INTO order_items (order_id, inventory_id, quantity, unit_price, line_total, created_at, updated_at)
SELECT o.id, i.id, 1, 80.00, 80.00, datetime('now'), datetime('now')
FROM orders o, inventory i WHERE o.order_number = 'SAMPLE-ORD-001' AND i.item_number = 'SAMPLE-004';

INSERT INTO order_items (order_id, inventory_id, quantity, unit_price, line_total, created_at, updated_at)
SELECT o.id, i.id, 1, 65.00, 65.00, datetime('now'), datetime('now')
FROM orders o, inventory i WHERE o.order_number = 'SAMPLE-ORD-002' AND i.item_number = 'SAMPLE-001';

INSERT INTO order_items (order_id, inventory_id, quantity, unit_price, line_total, created_at, updated_at)
SELECT o.id, i.id, 1, 55.00, 55.00, datetime('now'), datetime('now')
FROM orders o, inventory i WHERE o.order_number = 'SAMPLE-ORD-003' AND i.item_number = 'SAMPLE-006';

INSERT INTO order_items (order_id, inventory_id, quantity, unit_price, line_total, created_at, updated_at)
SELECT o.id, i.id, 1, 35.00, 35.00, datetime('now'), datetime('now')
FROM orders o, inventory i WHERE o.order_number = 'SAMPLE-ORD-004' AND i.item_number = 'SAMPLE-003';

INSERT INTO order_items (order_id, inventory_id, quantity, unit_price, line_total, created_at, updated_at)
SELECT o.id, i.id, 1, 40.00, 40.00, datetime('now'), datetime('now')
FROM orders o, inventory i WHERE o.order_number = 'SAMPLE-ORD-005' AND i.item_number = 'SAMPLE-007';

INSERT INTO order_items (order_id, inventory_id, quantity, unit_price, line_total, created_at, updated_at)
SELECT o.id, i.id, 1, 45.00, 45.00, datetime('now'), datetime('now')
FROM orders o, inventory i WHERE o.order_number = 'SAMPLE-ORD-006' AND i.item_number = 'SAMPLE-002';

INSERT INTO order_items (order_id, inventory_id, quantity, unit_price, line_total, created_at, updated_at)
SELECT o.id, i.id, 1, 120.00, 120.00, datetime('now'), datetime('now')
FROM orders o, inventory i WHERE o.order_number = 'SAMPLE-ORD-007' AND i.item_number = 'SAMPLE-008';

INSERT INTO order_items (order_id, inventory_id, quantity, unit_price, line_total, created_at, updated_at)
SELECT o.id, i.id, 1, 60.00, 60.00, datetime('now'), datetime('now')
FROM orders o, inventory i WHERE o.order_number = 'SAMPLE-ORD-008' AND i.item_number = 'SAMPLE-010';

-- tracking_number (ADR-031): uncomment after migration adds orders.tracking_number
-- UPDATE orders SET tracking_number = '9400111899223344556677' WHERE order_number = 'SAMPLE-ORD-001';
