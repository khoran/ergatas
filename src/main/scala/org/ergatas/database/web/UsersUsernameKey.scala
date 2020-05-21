package org.ergatas.database.web

object UsersUsernameKey extends QUsersUsernameKey("usersUsernameKey") {
  override def as(variable: String) = new QUsersUsernameKey(variable)

}

/**
 * UsersUsernameKey is a Querydsl bean type
 */
class UsersUsernameKey {

}

