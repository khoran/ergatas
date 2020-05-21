package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QUsersUsernameKey extends QUsersUsernameKey("usersUsernameKey") {
  override def as(variable: String) = new QUsersUsernameKey(variable)

}

class QUsersUsernameKey(md: PathMetadata[_]) extends RelationalPathImpl[UsersUsernameKey](md, "web", "users_username_key") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

}

