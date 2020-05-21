package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QOrganizationsView extends QOrganizationsView("organizationsView") {
  override def as(variable: String) = new QOrganizationsView(variable)

}

class QOrganizationsView(md: PathMetadata[_]) extends RelationalPathImpl[OrganizationsView](md, "web", "organizations_view") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

  val description = createString("description")

  val donationUrl = createString("donationUrl")

  val mainUrl = createString("mainUrl")

  val name = createString("name")

  val organizationKey = createNumber[Int]("organizationKey")

  addMetadata(description, ColumnMetadata.named("description").ofType(12).withSize(2147483647))
  addMetadata(donationUrl, ColumnMetadata.named("donation_url").ofType(12).withSize(2147483647))
  addMetadata(mainUrl, ColumnMetadata.named("main_url").ofType(12).withSize(2147483647))
  addMetadata(name, ColumnMetadata.named("name").ofType(12).withSize(2147483647))
  addMetadata(organizationKey, ColumnMetadata.named("organization_key").ofType(4).withSize(10))
}

