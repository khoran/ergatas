package org.ergatas.database.web

object Users extends QUsers("users") {
  override def as(variable: String) = new QUsers(variable)

}

/**
 * Users is a Querydsl bean type
 */
class Users {

  var email: String = _

  var firstName: String = _

  var lastName: String = _

  var password: String = _

  var picture: Array[Byte] = _

  var userKey: Integer = _

  var username: String = _

}

