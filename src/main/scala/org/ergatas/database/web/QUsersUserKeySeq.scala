package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QUsersUserKeySeq extends QUsersUserKeySeq("usersUserKeySeq") {
  override def as(variable: String) = new QUsersUserKeySeq(variable)

}

class QUsersUserKeySeq(md: PathMetadata[_]) extends RelationalPathImpl[UsersUserKeySeq](md, "web", "users_user_key_seq") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

}

