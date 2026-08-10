#!/bin/sh

# requires jq installed
# Generates public/currency_data.json from the restcountries snapshot:
#   currencies: unique list of {code, name, symbol} (ISO 4217)
#   countryToCurrency: map of alpha3 country code -> primary currency code

jq '{
  currencies: ([ .[] | .currencies[]?
                 | select(.code != null and .code != "(none)")
                 | {code: .code, name: .name, symbol: .symbol} ]
               | unique_by(.code) | sort_by(.code)),
  countryToCurrency: ([ .[]
                        | select((.currencies | length) > 0
                                 and .currencies[0].code != null
                                 and .currencies[0].code != "(none)")
                        | {(.alpha3Code): .currencies[0].code} ]
                      | add)
}' restcountries-all-july-2021.json > public/currency_data.json
