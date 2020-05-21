package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QUsersView extends QUsersView("usersView") {
  override def as(variable: String) = new QUsersView(variable)

}

class QUsersView(md: PathMetadata[_]) extends RelationalPathImpl[UsersView](md, "web", "users_view") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

  val email = createString("email")

  val firstName = createString("firstName")

  val lastName = createString("lastName")

  val password = createString("password")

  val picture = createSimple[Array[Byte]]("picture")

  val userKey = createNumber[Int]("userKey")

  val username = createString("username")

  addMetadata(email, ColumnMetadata.named("email").ofType(12).withSize(2147483647))
  addMetadata(firstName, ColumnMetadata.named("first_name").ofType(12).withSize(2147483647))
  addMetadata(lastName, ColumnMetadata.named("last_name").ofType(12).withSize(2147483647))
  addMetadata(password, ColumnMetadata.named("password").ofType(12).withSize(256))
  addMetadata(picture, ColumnMetadata.named("picture").ofType(-2).withSize(2147483647))
  addMetadata(userKey, ColumnMetadata.named("user_key").ofType(4).withSize(10))
  addMetadata(username, ColumnMetadata.named("username").ofType(12).withSize(256))
}

