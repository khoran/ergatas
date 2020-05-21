package org.ergatas.database.web

object Organizations extends QOrganizations("organizations") {
  override def as(variable: String) = new QOrganizations(variable)

}

/**
 * Organizations is a Querydsl bean type
 */
class Organizations {

  var description: String = _

  var donationUrl: String = _

  var mainUrl: String = _

  var name: String = _

  var organizationKey: Integer = _

}

