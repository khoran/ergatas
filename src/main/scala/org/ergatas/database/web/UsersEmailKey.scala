package org.ergatas.database.web

object UsersEmailKey extends QUsersEmailKey("usersEmailKey") {
  override def as(variable: String) = new QUsersEmailKey(variable)

}

/**
 * UsersEmailKey is a Querydsl bean type
 */
class UsersEmailKey {

}

