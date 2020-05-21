package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QProfileSearch extends QProfileSearch("profileSearch") {
  override def as(variable: String) = new QProfileSearch(variable)

}

class QProfileSearch(md: PathMetadata[_]) extends RelationalPathImpl[ProfileSearch](md, "web", "profile_search") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

  val currentSupportPercentage = createNumber[java.math.BigInteger]("currentSupportPercentage")

  val email = createString("email")

  val firstName = createString("firstName")

  val jobCatagory = createString("jobCatagory")

  val lastName = createString("lastName")

  val location = createString("location")

  val locationLat = createNumber[Double]("locationLat")

  val locationLong = createNumber[Double]("locationLong")

  val organizationDescription = createString("organizationDescription")

  val organizationDonationUrl = createString("organizationDonationUrl")

  val organizationName = createString("organizationName")

  val organizationUrl = createString("organizationUrl")

  val profileDescription = createString("profileDescription")

  val userKey = createNumber[Int]("userKey")

  val username = createString("username")

  addMetadata(currentSupportPercentage, ColumnMetadata.named("current_support_percentage").ofType(2).withSize(131089))
  addMetadata(email, ColumnMetadata.named("email").ofType(12).withSize(2147483647))
  addMetadata(firstName, ColumnMetadata.named("first_name").ofType(12).withSize(2147483647))
  addMetadata(jobCatagory, ColumnMetadata.named("job_catagory").ofType(12).withSize(2147483647))
  addMetadata(lastName, ColumnMetadata.named("last_name").ofType(12).withSize(2147483647))
  addMetadata(location, ColumnMetadata.named("location").ofType(12).withSize(2147483647))
  addMetadata(locationLat, ColumnMetadata.named("location_lat").ofType(8).withSize(17).withDigits(17))
  addMetadata(locationLong, ColumnMetadata.named("location_long").ofType(8).withSize(17).withDigits(17))
  addMetadata(organizationDescription, ColumnMetadata.named("organization_description").ofType(12).withSize(2147483647))
  addMetadata(organizationDonationUrl, ColumnMetadata.named("organization_donation_url").ofType(12).withSize(2147483647))
  addMetadata(organizationName, ColumnMetadata.named("organization_name").ofType(12).withSize(2147483647))
  addMetadata(organizationUrl, ColumnMetadata.named("organization_url").ofType(12).withSize(2147483647))
  addMetadata(profileDescription, ColumnMetadata.named("profile_description").ofType(12).withSize(2147483647))
  addMetadata(userKey, ColumnMetadata.named("user_key").ofType(4).withSize(10))
  addMetadata(username, ColumnMetadata.named("username").ofType(12).withSize(256))
}

