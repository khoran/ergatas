package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QProfileJobsProfileJobKeySeq extends QProfileJobsProfileJobKeySeq("profileJobsProfileJobKeySeq") {
  override def as(variable: String) = new QProfileJobsProfileJobKeySeq(variable)

}

class QProfileJobsProfileJobKeySeq(md: PathMetadata[_]) extends RelationalPathImpl[ProfileJobsProfileJobKeySeq](md, "web", "profile_jobs_profile_job_key_seq") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

}

