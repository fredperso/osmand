CREATE TABLE tracker_positions (
    id SERIAL PRIMARY KEY,
    tracker_id VARCHAR NOT NULL,
    devicename VARCHAR,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    speed DOUBLE PRECISION,
    bearing DOUBLE PRECISION,
    altitude DOUBLE PRECISION,
    accuracy DOUBLE PRECISION,
    battery DOUBLE PRECISION,
    charge BOOLEAN
);
CREATE INDEX idx_tracker_time ON tracker_positions (tracker_id, timestamp);
