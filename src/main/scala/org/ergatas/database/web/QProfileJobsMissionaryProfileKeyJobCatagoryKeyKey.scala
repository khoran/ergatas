package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QProfileJobsMissionaryProfileKeyJobCatagoryKeyKey extends QProfileJobsMissionaryProfileKeyJobCatagoryKeyKey("profileJobsMissionaryProfileKeyJobCatagoryKeyKey") {
  override def as(variable: String) = new QProfileJobsMissionaryProfileKeyJobCatagoryKeyKey(variable)

}

class QProfileJobsMissionaryProfileKeyJobCatagoryKeyKey(md: PathMetadata[_]) extends RelationalPathImpl[ProfileJobsMissionaryProfileKeyJobCatagoryKeyKey](md, "web", "profile_jobs_missionary_profile_key_job_catagory_key_key") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

}

