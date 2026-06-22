INSERT INTO "Channel" ("id", "serverId", "name", "type", "position", "bitrate", "allowVideo", "allowScreenShare", "lowLatencyMode", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, id, 'Let''s Meet', 'VOICE', 99, 64000, true, true, true, now(), now()
FROM "Server"
WHERE id NOT IN (SELECT "serverId" FROM "Channel" WHERE "name" = 'Let''s Meet' AND "type" = 'VOICE');

INSERT INTO "Channel" ("id", "serverId", "name", "type", "position", "bitrate", "allowVideo", "allowScreenShare", "lowLatencyMode", "createdAt", "updatedAt", "requirePushToTalk", "slowModeSeconds", "nsfw", "isLocked")
SELECT gen_random_uuid()::text, id, 'AFK', 'VOICE', 100, 64000, false, false, true, now(), now(), false, 0, false, false
FROM "Server"
WHERE id NOT IN (SELECT "serverId" FROM "Channel" WHERE "name" = 'AFK' AND "type" = 'VOICE');
