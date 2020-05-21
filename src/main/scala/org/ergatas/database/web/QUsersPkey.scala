package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QUsersPkey extends QUsersPkey("usersPkey") {
  override def as(variable: String) = new QUsersPkey(variable)

}

class QUsersPkey(md: PathMetadata[_]) extends RelationalPathImpl[UsersPkey](md, "web", "users_pkey") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

}

