ALTER TABLE channel_streams ADD COLUMN stream_codec varchar(50);
ALTER TABLE channel_streams ADD COLUMN stream_format varchar(50);
ALTER TABLE channel_streams ADD COLUMN stream_width integer;
ALTER TABLE channel_streams ADD COLUMN stream_height integer;
ALTER TABLE channel_streams ADD COLUMN stream_frame_rate real;
ALTER TABLE channel_streams ADD COLUMN stream_bitrate integer;
