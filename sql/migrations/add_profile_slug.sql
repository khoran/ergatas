-- Add profile_slug column to missionary_profiles table
ALTER TABLE web.missionary_profiles ADD COLUMN profile_slug varchar UNIQUE;

-- Function to generate unique slug
CREATE OR REPLACE FUNCTION generate_unique_slug(first_name text, last_name text, profile_key int)
RETURNS text AS $$
DECLARE
    base_slug text;
    final_slug text;
    counter int := 1;
BEGIN
    -- Clean and create base slug
    base_slug := lower(regexp_replace(first_name || '-' || last_name, '[^a-zA-Z0-9\-_]', '-', 'g'));
    base_slug := regexp_replace(base_slug, '-+', '-', 'g');
    base_slug := trim(both '-' from base_slug);

    -- Ensure base_slug is not empty
    IF base_slug = '' THEN
        base_slug := 'profile-' || profile_key;
    END IF;

    final_slug := base_slug;

    -- Check uniqueness and append counter if needed
    WHILE EXISTS (SELECT 1 FROM web.missionary_profiles WHERE profile_slug = final_slug AND missionary_profile_key != profile_key) LOOP
        final_slug := base_slug || '-' || counter;
        counter := counter + 1;
    END LOOP;

    RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- Populate profile_slug for existing profiles
UPDATE web.missionary_profiles
SET profile_slug = generate_unique_slug(data->>'first_name', data->>'last_name', missionary_profile_key)
WHERE profile_slug IS NULL;

-- Make profile_slug NOT NULL after populating
ALTER TABLE web.missionary_profiles ALTER COLUMN profile_slug SET NOT NULL;

-- Drop the function as it's no longer needed
DROP FUNCTION generate_unique_slug(text, text, int);