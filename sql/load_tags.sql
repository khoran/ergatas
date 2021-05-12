
INSERT INTO web.tags(name)
    VALUES
        ('Perspectives (or equiv) Alumni'),
        ('Sensitive Location'),
        ('GoCorps Goer')
    ON CONFLICT DO NOTHING;