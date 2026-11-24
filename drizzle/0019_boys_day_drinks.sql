CREATE TABLE boys_day_drink_orders (
  student_id TEXT PRIMARY KEY NOT NULL REFERENCES class_roster(student_id),
  order_json TEXT NOT NULL CHECK (json_valid(order_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
UPDATE class_roster SET name = '示例甲' WHERE name = '示例旧甲';
