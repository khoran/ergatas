package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QOrganizationsOrganizationKeySeq extends QOrganizationsOrganizationKeySeq("organizationsOrganizationKeySeq") {
  override def as(variable: String) = new QOrganizationsOrganizationKeySeq(variable)

}

class QOrganizationsOrganizationKeySeq(md: PathMetadata[_]) extends RelationalPathImpl[OrganizationsOrganizationKeySeq](md, "web", "organizations_organization_key_seq") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

}

