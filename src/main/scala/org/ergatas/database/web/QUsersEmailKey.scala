package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QUsersEmailKey extends QUsersEmailKey("usersEmailKey") {
  override def as(variable: String) = new QUsersEmailKey(variable)

}

class QUsersEmailKey(md: PathMetadata[_]) extends RelationalPathImpl[UsersEmailKey](md, "web", "users_email_key") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

}

