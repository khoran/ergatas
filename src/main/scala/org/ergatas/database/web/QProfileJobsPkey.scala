package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QProfileJobsPkey extends QProfileJobsPkey("profileJobsPkey") {
  override def as(variable: String) = new QProfileJobsPkey(variable)

}

class QProfileJobsPkey(md: PathMetadata[_]) extends RelationalPathImpl[ProfileJobsPkey](md, "web", "profile_jobs_pkey") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

}

