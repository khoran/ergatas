package org.ergatas.database.web

object OrganizationsView extends QOrganizationsView("organizationsView") {
  override def as(variable: String) = new QOrganizationsView(variable)

}

/**
 * OrganizationsView is a Querydsl bean type
 */
class OrganizationsView {

  var description: String = _

  var donationUrl: String = _

  var mainUrl: String = _

  var name: String = _

  var organizationKey: Integer = _

}

