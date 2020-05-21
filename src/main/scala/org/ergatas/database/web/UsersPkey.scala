package org.ergatas.database.web

object UsersPkey extends QUsersPkey("usersPkey") {
  override def as(variable: String) = new QUsersPkey(variable)

}

/**
 * UsersPkey is a Querydsl bean type
 */
class UsersPkey {

}

