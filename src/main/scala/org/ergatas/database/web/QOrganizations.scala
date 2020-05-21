package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QOrganizations extends QOrganizations("organizations") {
  override def as(variable: String) = new QOrganizations(variable)

}

class QOrganizations(md: PathMetadata[_]) extends RelationalPathImpl[Organizations](md, "web", "organizations") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

  val description = createString("description")

  val donationUrl = createString("donationUrl")

  val mainUrl = createString("mainUrl")

  val name = createString("name")

  val organizationKey = createNumber[Int]("organizationKey")

  val organizationsPkey: PrimaryKey[Organizations] = createPrimaryKey(organizationKey)

  val _missionaryProfilesOrganizationKeyFkey: ForeignKey[MissionaryProfiles] = createInvForeignKey(organizationKey, "organization_key")

  addMetadata(description, ColumnMetadata.named("description").ofType(12).withSize(2147483647).notNull())
  addMetadata(donationUrl, ColumnMetadata.named("donation_url").ofType(12).withSize(2147483647).notNull())
  addMetadata(mainUrl, ColumnMetadata.named("main_url").ofType(12).withSize(2147483647).notNull())
  addMetadata(name, ColumnMetadata.named("name").ofType(12).withSize(2147483647).notNull())
  addMetadata(organizationKey, ColumnMetadata.named("organization_key").ofType(4).withSize(10).notNull())
}

