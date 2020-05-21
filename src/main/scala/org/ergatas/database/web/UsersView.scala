package org.ergatas.database.web

object UsersView extends QUsersView("usersView") {
  override def as(variable: String) = new QUsersView(variable)

}

/**
 * UsersView is a Querydsl bean type
 */
class UsersView {

  var email: String = _

  var firstName: String = _

  var lastName: String = _

  var password: String = _

  var picture: Array[Byte] = _

  var userKey: Integer = _

  var username: String = _

}

