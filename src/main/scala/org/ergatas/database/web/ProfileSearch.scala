package org.ergatas.database.web

object ProfileSearch extends QProfileSearch("profileSearch") {
  override def as(variable: String) = new QProfileSearch(variable)

}

/**
 * ProfileSearch is a Querydsl bean type
 */
class ProfileSearch {

  var currentSupportPercentage: java.math.BigInteger = _

  var email: String = _

  var firstName: String = _

  var jobCatagory: String = _

  var lastName: String = _

  var location: String = _

  var locationLat: java.lang.Double = _

  var locationLong: java.lang.Double = _

  var organizationDescription: String = _

  var organizationDonationUrl: String = _

  var organizationName: String = _

  var organizationUrl: String = _

  var profileDescription: String = _

  var userKey: Integer = _

  var username: String = _

}

