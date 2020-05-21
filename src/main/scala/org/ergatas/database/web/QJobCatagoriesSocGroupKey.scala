package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QJobCatagoriesSocGroupKey extends QJobCatagoriesSocGroupKey("jobCatagoriesSocGroupKey") {
  override def as(variable: String) = new QJobCatagoriesSocGroupKey(variable)

}

class QJobCatagoriesSocGroupKey(md: PathMetadata[_]) extends RelationalPathImpl[JobCatagoriesSocGroupKey](md, "web", "job_catagories_soc_group_key") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

}

