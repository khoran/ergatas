package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QJobCatagoriesJobCatagoryKeySeq extends QJobCatagoriesJobCatagoryKeySeq("jobCatagoriesJobCatagoryKeySeq") {
  override def as(variable: String) = new QJobCatagoriesJobCatagoryKeySeq(variable)

}

class QJobCatagoriesJobCatagoryKeySeq(md: PathMetadata[_]) extends RelationalPathImpl[JobCatagoriesJobCatagoryKeySeq](md, "web", "job_catagories_job_catagory_key_seq") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

}

