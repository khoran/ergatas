CREATE TABLE IF NOT EXISTS web.donors(

    donor_key serial PRIMARY KEY NOT NULL,
    stripe_customer_id varchar UNIQUE NOT NULL,
    created_on timestamp NOT NULL DEFAULT now(),
    created_by varchar NOT NULL DEFAULT current_user
);
ALTER TABLE web.donors OWNER TO ergatas_dev;



ALTER TABLE web.possible_transactions ADD COLUMN donor_key int REFERENCES web.donors(donor_key);