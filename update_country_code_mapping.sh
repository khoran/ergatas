#!/bin/sh

# requries jq installed

curl https://restcountries.eu/rest/v2/all |jq '[.[] | {(.alpha2Code): .alpha3Code}] | add' > lib/data/country_code_mapping.json
