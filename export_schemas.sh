#!/bin/bash

#HOST=postgres.us.grn:5432
HOST=localhost:5432

SCHEMAS="web"
#SCHEMAS=$@


for s in $SCHEMAS;
do
	echo Exporting $s;
	mvn querydsl:export -Dschema=$s -DdbHost=$HOST;
done

