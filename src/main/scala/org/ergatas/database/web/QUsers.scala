package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QUsers extends QUsers("users") {
  override def as(variable: String) = new QUsers(variable)

}

class QUsers(md: PathMetadata[_]) extends RelationalPathImpl[Users](md, "web", "users") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

  val email = createString("email")

  val firstName = createString("firstName")

  val lastName = createString("lastName")

  val password = createString("password")

  val picture = createSimple[Array[Byte]]("picture")

  val userKey = createNumber[Int]("userKey")

  val username = createString("username")

  val usersPkey: PrimaryKey[Users] = createPrimaryKey(userKey)

  val _missionaryProfilesUserKeyFkey: ForeignKey[MissionaryProfiles] = createInvForeignKey(userKey, "user_key")

  addMetadata(email, ColumnMetadata.named("email").ofType(12).withSize(2147483647).notNull())
  addMetadata(firstName, ColumnMetadata.named("first_name").ofType(12).withSize(2147483647).notNull())
  addMetadata(lastName, ColumnMetadata.named("last_name").ofType(12).withSize(2147483647).notNull())
  addMetadata(password, ColumnMetadata.named("password").ofType(12).withSize(256).notNull())
  addMetadata(picture, ColumnMetadata.named("picture").ofType(-2).withSize(2147483647))
  addMetadata(userKey, ColumnMetadata.named("user_key").ofType(4).withSize(10).notNull())
  addMetadata(username, ColumnMetadata.named("username").ofType(12).withSize(256).notNull())
}

