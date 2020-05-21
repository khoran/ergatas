package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QJobCatagoriesPkey extends QJobCatagoriesPkey("jobCatagoriesPkey") {
  override def as(variable: String) = new QJobCatagoriesPkey(variable)

}

class QJobCatagoriesPkey(md: PathMetadata[_]) extends RelationalPathImpl[JobCatagoriesPkey](md, "web", "job_catagories_pkey") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

}

