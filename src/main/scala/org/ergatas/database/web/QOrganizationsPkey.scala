package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QOrganizationsPkey extends QOrganizationsPkey("organizationsPkey") {
  override def as(variable: String) = new QOrganizationsPkey(variable)

}

class QOrganizationsPkey(md: PathMetadata[_]) extends RelationalPathImpl[OrganizationsPkey](md, "web", "organizations_pkey") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

}

